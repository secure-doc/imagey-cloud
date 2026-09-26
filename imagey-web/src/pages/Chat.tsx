import { useCallback, useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { useBackButton, useTitle } from "../contexts/ActionBarContext";
import { contactService } from "../contact/ContactService";
import { contactDisplayName } from "../contact/contactDisplayName";
import { ContactEntry } from "../document/DocumentMetadata";
import { SendMessageForm } from "../chat/SendMessageForm";
import { usePolling } from "../chat/messageHooks";
import { ChatsList } from "./Chats";
import { SharedDocumentMessage } from "../chat/SharedDocumentMessage";
import { useChatsId } from "../contexts/SettingsContext";
import { useContactProfile } from "../hooks/useContactProfile";

export default function Chat({ contactUserId }: { contactUserId: string }) {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const privateKey = authentication.keyPairs?.mainKeyPair.privateKey;
  const chatsId = useChatsId();

  const [sharedKey, setSharedKey] = useState<JsonWebKey>();
  const [publicProfiles, setPublicProfiles] =
    useState<Record<string, string>>();
  const [chat, setChat] = useState<{ ownerId: string; chatId: string }>();
  // Whether the chat key came from the contact's `pending` part because the
  // inviter has not created the chat Document yet (ADR 0015); undefined while
  // the key is still loading.
  const [chatPending, setChatPending] = useState<boolean>();
  const [keyError, setKeyError] = useState(false);
  const [chatsLoadFailed, setChatsLoadFailed] = useState(false);
  // Populated once the sidebar ChatsList has loaded the "chats" document -
  // reused here instead of loading that same document a second time (see
  // Chats.tsx's ChatsList onLoaded prop).
  const [chatsDocumentInfo, setChatsDocumentInfo] = useState<{
    contacts: ContactEntry[];
    chatsDocumentKey: JsonWebKey;
    name: string;
    revision: string;
  }>();
  const { messages, setMessages } = usePolling(
    user,
    chat?.ownerId,
    chat?.chatId,
    sharedKey,
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    name: contactName,
    avatarUrl: contactAvatarUrl,
    avatarId: contactAvatarId,
    revision: contactProfileRevision,
  } = useContactProfile(
    user,
    contactUserId,
    publicProfiles?.[contactUserId],
    sharedKey,
  );

  useBackButton();

  const handleChatsListLoaded = useCallback(
    (chatsDocument: {
      contacts: ContactEntry[];
      key: JsonWebKey;
      name: string;
      revision: string;
    }) =>
      setChatsDocumentInfo({
        contacts: chatsDocument.contacts,
        chatsDocumentKey: chatsDocument.key,
        name: chatsDocument.name,
        revision: chatsDocument.revision,
      }),
    [],
  );

  // The chat list's own ContactEntry.name/avatarId is a snapshot taken at
  // accept/receive time - refresh it in the "chats" document whenever the
  // contact's PublicProfile has moved on since (a real name/avatar change).
  useEffect(() => {
    if (!chatsDocumentInfo || !contactProfileRevision) {
      return;
    }
    const contact = chatsDocumentInfo.contacts.find(
      (c) => c.userId === contactUserId,
    );
    if (!contact || contact.profileRevision === contactProfileRevision) {
      return;
    }
    contactService
      .updateContactProfileSnapshot(
        user,
        {
          documentId: chatsId,
          name: chatsDocumentInfo.name,
          key: chatsDocumentInfo.chatsDocumentKey,
          revision: chatsDocumentInfo.revision,
          contacts: chatsDocumentInfo.contacts,
        },
        contactUserId,
        {
          name: contactName || contact.name,
          avatarId: contactAvatarId,
          revision: contactProfileRevision,
        },
      )
      .then(({ contacts, revision }) => {
        if (revision) {
          setChatsDocumentInfo((prev) =>
            prev ? { ...prev, contacts, revision } : prev,
          );
        }
      })
      .catch((e) =>
        console.error("Failed to refresh contact profile snapshot", e),
      );
  }, [
    chatsDocumentInfo,
    contactUserId,
    contactName,
    contactAvatarId,
    contactProfileRevision,
    chatsId,
    user,
  ]);

  // Once the chat Document itself has loaded (the inviter created it and the
  // server filed our key entry, ADR 0015), the contact's `pending` chat key is
  // no longer needed - remove it from the "chats" document.
  const hasPendingChatKey = !!chatsDocumentInfo?.contacts.find(
    (c) => c.userId === contactUserId,
  )?.pending;
  useEffect(() => {
    if (!chatsDocumentInfo || chatPending !== false || !hasPendingChatKey) {
      return;
    }
    contactService
      .dropPendingChatKey(
        user,
        {
          documentId: chatsId,
          name: chatsDocumentInfo.name,
          key: chatsDocumentInfo.chatsDocumentKey,
          revision: chatsDocumentInfo.revision,
          contacts: chatsDocumentInfo.contacts,
        },
        contactUserId,
      )
      .then(({ contacts, revision }) => {
        if (revision) {
          setChatsDocumentInfo((prev) =>
            prev ? { ...prev, contacts, revision } : prev,
          );
        }
      })
      .catch((e) => console.error("Failed to drop pending chat key", e));
    // Only re-run when the pending state changes, not on every write of the
    // "chats" document (e.g. a profile-snapshot sync).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatPending, hasPendingChatKey, contactUserId, chatsId, user]);

  // The chat's shared key is the chat Document's own Document key - look up
  // the matching Contact in the "chats" document, then let ContactService
  // figure out whether it's ours (self-issued) or the other party's (ECDH-
  // wrapped for us). Depending only on the contact's owner/chatId (rather
  // than the whole chatsDocumentInfo object) keeps a profile-snapshot sync
  // (which replaces chatsDocumentInfo purely to patch one contact's cached
  // name/avatar) from re-running this effect and reloading the open chat.
  const contact = chatsDocumentInfo?.contacts.find(
    (c) => c.userId === contactUserId,
  );
  const chatsDocumentKey = chatsDocumentInfo?.chatsDocumentKey;

  // The freshly loaded public-profile name, else the contact entry's cached
  // name/address - never the opaque userId.
  const displayName =
    contactName ||
    contactDisplayName(contactUserId, contact ?? {}, t("Unknown contact"));
  useTitle(displayName, contactAvatarUrl ?? "");

  useEffect(() => {
    if (!contactUserId || !privateKey || !chatsDocumentKey) {
      return;
    }
    setSharedKey(undefined);
    setPublicProfiles(undefined);
    setChat(undefined);
    setChatPending(undefined);
    setKeyError(false);
    if (!contact) {
      console.error(`No chat found for contact ${contactUserId}`);
      setKeyError(true);
      return;
    }
    setChat({ ownerId: contact.owner, chatId: contact.chatId });
    contactService
      .loadChatKey(user, contact, chatsId, chatsDocumentKey)
      .then(({ key, publicProfiles, pending }) => {
        setSharedKey(key);
        setPublicProfiles(publicProfiles);
        setChatPending(pending);
      })
      .catch((e) => {
        console.error(e);
        setKeyError(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user,
    contactUserId,
    chatsId,
    chatsDocumentKey,
    contact?.owner,
    contact?.chatId,
    privateKey,
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <main className="grid no-margin no-space no-padding">
      <ChatsList
        id={chatsId}
        className="m l"
        activeContactUserId={contactUserId}
        onLoaded={handleChatsListLoaded}
        onLoadError={setChatsLoadFailed}
      />
      <div
        className="col s12 m8 l8 vertical"
        style={{
          height: "calc(100vh - 64px)",
        }}
      >
        {chatsLoadFailed ? (
          <div className="padding">
            Could not load your chats right now. Retrying...
          </div>
        ) : keyError ? (
          <div className="padding">
            There was an error decrypting the messages. This may be because the
            keys have changed.
          </div>
        ) : messages === undefined || sharedKey === undefined ? (
          <div className="max flex center-align middle-align">
            <progress className="circle"></progress>
          </div>
        ) : (
          <>
            <div
              className="scroll padding vertical"
              style={{
                flexGrow: 1,
                gap: "0.5rem",
              }}
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`padding elevate ${
                    m.sender === user
                      ? "primary top-round left-round"
                      : "surface-container top-round right-round"
                  }`}
                  style={{
                    alignSelf: m.sender === user ? "flex-end" : "flex-start",
                    maxWidth: "80%",
                    wordWrap: "break-word",
                  }}
                >
                  {(() => {
                    if (m.content.startsWith('{"type":"shared-document"')) {
                      try {
                        const payload = JSON.parse(m.content);
                        return (
                          <SharedDocumentMessage
                            documentId={payload.documentId}
                            owner={payload.owner}
                            chatKey={sharedKey}
                          />
                        );
                      } catch {
                        return m.content;
                      }
                    }
                    return m.content;
                  })()}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            {user && contactUserId && chat && (
              <>
                <hr className="divider" />
                <SendMessageForm
                  userId={user}
                  contactUserId={contactUserId}
                  ownerId={chat.ownerId}
                  chatId={chat.chatId}
                  sharedKey={sharedKey}
                  onMessageSent={(newMessage) =>
                    setMessages((prev) => [...(prev ?? []), newMessage])
                  }
                />
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
