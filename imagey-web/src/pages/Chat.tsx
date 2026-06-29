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
  const [keyError, setKeyError] = useState(false);
  const { messages, setMessages } = usePolling(user, contactEmail, sharedKey);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useBackButton();

  useEffect(() => {
    if (contactEmail && publicKey && privateKey) {
      contactService
        .loadSharedKey(user, contactEmail, publicKey, privateKey)
        .then((decryptedKey) => {
          setSharedKey(decryptedKey);
          setKeyError(false);
        })
        .catch((e) => {
          console.error(e);
          setKeyError(true);
        });
    }
  }, [user, contactEmail, publicKey, privateKey]);

  const handleReissue = async () => {
    if (contactEmail && publicKey && privateKey) {
      try {
        const newSharedKey = await contactService.reissueKey(
          user,
          contactEmail,
          publicKey,
          privateKey,
        );
        setSharedKey(newSharedKey);
        setKeyError(false);
      } catch (e) {
        console.error("Failed to reissue key:", e);
      }
    }
  };

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
      {keyError && (
        <dialog className="modal active" open>
          <h5>Decryption Error</h5>
          <div>
            There was an error decrypting the messages. This may be because the
            keys have changed. You can try to re-issue the keys, but all
            previous messages will be lost. Do you want to proceed?
          </div>
          <nav className="right-align">
            <button className="border" onClick={() => setKeyError(false)}>
              Abbrechen
            </button>
            <button onClick={handleReissue}>Re-Issue</button>
          </nav>
        </dialog>
      )}
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
