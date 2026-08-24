import { useCallback, useEffect, useState, useRef } from "react";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { useBackButton, useTitle } from "../contexts/ActionBarContext";
import { contactService } from "../contact/ContactService";
import { Contact } from "../contact/Contact";
import { SendMessageForm } from "../chat/SendMessageForm";
import { usePolling } from "../chat/messageHooks";
import { ChatsList } from "./Chats";
import { SharedDocumentMessage } from "../chat/SharedDocumentMessage";
import { useChatsId } from "../contexts/SettingsContext";

export default function Chat({ contactEmail }: { contactEmail: string }) {
  const authentication = useAuthentication();
  const user = authentication.user;
  const privateKey = authentication.keyPairs?.mainKeyPair.privateKey;
  const chatsId = useChatsId();

  const [sharedKey, setSharedKey] = useState<JsonWebKey>();
  const [chat, setChat] = useState<{ ownerEmail: string; chatId: string }>();
  const [keyError, setKeyError] = useState(false);
  const [chatsLoadFailed, setChatsLoadFailed] = useState(false);
  // Populated once the sidebar ChatsList has loaded the "chats" document -
  // reused here instead of loading that same document a second time (see
  // Chats.tsx's ChatsList onLoaded prop).
  const [chatsDocumentInfo, setChatsDocumentInfo] = useState<{
    contacts: Contact[];
    chatsDocumentKey: JsonWebKey;
  }>();
  const { messages, setMessages } = usePolling(
    user,
    chat?.ownerEmail,
    chat?.chatId,
    sharedKey,
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useBackButton();
  useTitle(contactEmail);

  const handleChatsListLoaded = useCallback(
    (contacts: Contact[], chatsDocumentKey: JsonWebKey) =>
      setChatsDocumentInfo({ contacts, chatsDocumentKey }),
    [],
  );

  useEffect(() => {
    if (!contactEmail || !privateKey || !chatsDocumentInfo) {
      return;
    }
    setSharedKey(undefined);
    setChat(undefined);
    setKeyError(false);
    // The chat's shared key is the chat Document's own Document key - look
    // up the matching Contact in the "chats" document, then let
    // ContactService figure out whether it's ours (self-issued) or the
    // other party's (ECDH-wrapped for us).
    const contact = chatsDocumentInfo.contacts.find(
      (c) => c.userId === contactEmail,
    );
    if (!contact) {
      console.error(`No chat found for contact ${contactEmail}`);
      setKeyError(true);
      return;
    }
    setChat({ ownerEmail: contact.owner, chatId: contact.chatId });
    contactService
      .loadChatKey(user, contact, chatsId, chatsDocumentInfo.chatsDocumentKey)
      .then((decryptedKey) => setSharedKey(decryptedKey))
      .catch((e) => {
        console.error(e);
        setKeyError(true);
      });
  }, [user, contactEmail, chatsId, chatsDocumentInfo, privateKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <main className="grid no-margin no-space no-padding">
      <ChatsList
        id={chatsId}
        className="m l"
        activeContactEmail={contactEmail}
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
            {user && contactEmail && chat && (
              <>
                <hr className="divider" />
                <SendMessageForm
                  userEmail={user}
                  contactEmail={contactEmail}
                  ownerEmail={chat.ownerEmail}
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
