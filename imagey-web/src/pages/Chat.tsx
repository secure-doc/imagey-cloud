import { useEffect, useState, useRef } from "react";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { useBackButton } from "../contexts/ActionBarContext";
import { contactService } from "../contact/ContactService";
import { SendMessageForm } from "../chat/SendMessageForm";
import { usePolling } from "../chat/messageHooks";

export default function Chat({ contactEmail }: { contactEmail: string }) {
  const authentication = useAuthentication();
  const user = authentication.user;
  const publicKey = authentication.keyPairs?.mainKeyPair.publicKey;
  const privateKey = authentication.keyPairs?.mainKeyPair.privateKey;

  const [sharedKey, setSharedKey] = useState<JsonWebKey>();
  const { messages, setMessages } = usePolling(user, contactEmail, sharedKey);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useBackButton();

  useEffect(() => {
    if (contactEmail && publicKey && privateKey) {
      contactService
        .loadSharedKey(user, contactEmail, publicKey, privateKey)
        .then((decryptedKey) => setSharedKey(decryptedKey));
    }
  }, [user, contactEmail, publicKey, privateKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <main
      className="max"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 144px)",
      }}
    >
      <h5 className="center-align vertical-margin">{contactEmail}</h5>
      {messages === undefined || sharedKey === undefined ? (
        <div className="max flex center-align middle-align">
          <progress className="circle"></progress>
        </div>
      ) : (
        <>
          <div
            className="scroll padding"
            style={{
              display: "flex",
              flexDirection: "column",
              flexGrow: 1,
              gap: "0.5rem",
            }}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`padding elevate ${
                  m.isMine
                    ? "primary top-round left-round"
                    : "surface-container top-round right-round"
                }`}
                style={{
                  alignSelf: m.isMine ? "flex-end" : "flex-start",
                  maxWidth: "80%",
                  wordWrap: "break-word",
                }}
              >
                {m.content}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          {user && contactEmail && (
            <>
              <hr className="divider" />
              <SendMessageForm
                userEmail={user}
                contactEmail={contactEmail}
                sharedKey={sharedKey}
                onMessageSent={(newMessage) =>
                  setMessages((prev) => [...(prev ?? []), newMessage])
                }
              />
            </>
          )}
        </>
      )}
    </main>
  );
}
