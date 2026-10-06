import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { useBackButton, useTitle } from "../contexts/ActionBarContext";
import { contactService } from "../contact/ContactService";
import { groupService } from "../contact/GroupService";
import { publicProfileService } from "../profile/publicProfileService";
import { contactDisplayName } from "../contact/contactDisplayName";
import { ContactEntry, GroupEntry } from "../document/DocumentMetadata";
import { documentService } from "../document/DocumentService";
import { ConversationView } from "../chat/ConversationView";
import { GroupInvitationMessage } from "../chat/GroupInvitationMessage";
import { usePolling } from "../chat/messageHooks";
import { ChatsList } from "./Chats";
import { useChatsId } from "../contexts/SettingsContext";
import { useContactProfile } from "../hooks/useContactProfile";
import { notificationKeyringService } from "../notification/NotificationKeyringService";

type ChatsListUpdate = (
  list: { contacts: ContactEntry[]; groups: GroupEntry[] },
  revision: string | null,
) => void;

export default function Chat({ contactUserId }: { contactUserId: string }) {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const settings = authentication.settings;
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
    groups: GroupEntry[];
    chatsDocumentKey: JsonWebKey;
    name: string;
    revision: string;
  }>();
  const { messages, appendMessage } = usePolling(
    user,
    chat?.ownerId,
    chat?.chatId,
    sharedKey,
  );

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
      groups: GroupEntry[];
      key: JsonWebKey;
      name: string;
      revision: string;
    }) =>
      setChatsDocumentInfo({
        contacts: chatsDocument.contacts,
        groups: chatsDocument.groups,
        chatsDocumentKey: chatsDocument.key,
        name: chatsDocument.name,
        revision: chatsDocument.revision,
      }),
    [],
  );

  // ChatsList owns the canonical "chats" document state; this ref is how
  // handleJoinGroup writes a change back into it instead of only patching the
  // local chatsDocumentInfo copy below, which ChatsList's own onLoaded
  // republish (e.g. from an unrelated contact-request pickup) would otherwise
  // overwrite with its older state.
  const updateChatsListRef = useRef<ChatsListUpdate>(undefined);
  const registerChatsListUpdate = useCallback((update: ChatsListUpdate) => {
    updateChatsListRef.current = update;
  }, []);

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
          groups: chatsDocumentInfo.groups,
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
  // server has filed our key entry, ADR 0015), the contact's `pending` chat key is
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
          groups: chatsDocumentInfo.groups,
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
        if (authentication.keyPairs?.deviceKeyPair) {
          notificationKeyringService
            .rememberChat(user, authentication.keyPairs.deviceKeyPair, {
              owner: contact.owner,
              chatId: contact.chatId,
              key,
              title: contactDisplayName(
                contactUserId,
                contact,
                t("Unknown contact"),
              ),
              route: `/chats/${contactUserId}`,
              group: false,
            })
            .catch((e) =>
              console.warn("Failed to remember chat for notifications", e),
            );
        }
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

  // Joins a group from an invitation posted in this 1:1 chat (ADR 0019
  // decision 3): resolves our own public profile (get-or-create, like
  // AcceptInvitationButton), then hands off to GroupService.joinGroup, which
  // loads the group Document (via the 1:1 chat key = `sharedKey`), records a
  // GroupEntry and shares our profile into the group. Updates the local
  // chatsDocumentInfo so the sidebar and this message's "Open" state refresh
  // immediately, without a full reload.
  const handleJoinGroup = useCallback(
    async (invitation: { groupId: string; owner: string }) => {
      if (!chatsDocumentInfo || !sharedKey) {
        return;
      }
      const { publicProfile } =
        await publicProfileService.loadProfileAndEnsurePublicProfile(
          user,
          settings,
        );
      const { list, revision } = await groupService.joinGroup(
        user,
        invitation.owner,
        invitation.groupId,
        sharedKey,
        {
          documentId: chatsId,
          name: chatsDocumentInfo.name,
          key: chatsDocumentInfo.chatsDocumentKey,
          revision: chatsDocumentInfo.revision,
          contacts: chatsDocumentInfo.contacts,
          groups: chatsDocumentInfo.groups,
        },
        publicProfile,
      );
      updateChatsListRef.current?.(list, revision);
    },
    [chatsDocumentInfo, sharedKey, user, settings, chatsId],
  );

  return (
    <main className="grid no-margin no-space no-padding">
      <ChatsList
        id={chatsId}
        className="m l"
        activeContactUserId={contactUserId}
        onLoaded={handleChatsListLoaded}
        onLoadError={setChatsLoadFailed}
        registerUpdate={registerChatsListUpdate}
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
          user &&
          contactUserId &&
          chat && (
            <ConversationView
              userId={user}
              ownerId={chat.ownerId}
              chatId={chat.chatId}
              sharedKey={sharedKey}
              contactUserId={contactUserId}
              messages={messages}
              onMessageSent={(newMessage) => appendMessage(newMessage)}
              notify={[contactUserId]}
              share={(document) =>
                documentService.shareDocument(
                  user,
                  document,
                  contactUserId,
                  sharedKey,
                )
              }
              renderInvitation={(invitation) => (
                <GroupInvitationMessage
                  groupId={invitation.groupId}
                  name={invitation.name}
                  alreadyJoined={
                    chatsDocumentInfo?.groups.some(
                      (g) => g.groupId === invitation.groupId,
                    ) ?? false
                  }
                  onJoin={() => handleJoinGroup(invitation)}
                />
              )}
            />
          )
        )}
      </div>
    </main>
  );
}
