import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { useActionIcons } from "../contexts/ActionBarContext";
import { contactRepository } from "../contact/ContactRepository";
import { messageRepository } from "../chat/MessageRepository";
import { authenticationRepository } from "../authentication/AuthenticationRepository";
import { Message } from "../chat/Message";
import { cryptoService } from "../authentication/CryptoService";

export default function Chat() {
  const { contactEmail } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const authentication = useAuthentication();
  const user = authentication.user;
  const publicKey = authentication.keyPairs?.mainKeyPair.publicKey;
  const privateKey = authentication.keyPairs?.mainKeyPair.privateKey;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [sharedKey, setSharedKey] = useState<JsonWebKey | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const actionIcons = [
    <button
      key="back"
      className="circle transparent"
      onClick={() => navigate(-1)}
    >
      <i>arrow_back</i>
    </button>,
  ];
  useActionIcons(actionIcons);

  useEffect(() => {
    let mounted = true;
    if (user && contactEmail && privateKey) {
      const fetchKey = async () => {
        try {
          const encryptedKeys = await contactRepository.getSharedContactKeys(
            user,
            contactEmail,
          );
          let decryptedKey;
          console.log("keys: " + JSON.stringify(encryptedKeys));
          if (encryptedKeys.invitationKey) {
            console.log("Invitation key found");
            const contactPublicKey =
              await authenticationRepository.loadPublicMainKey(contactEmail);
            console.log("Public key loaded");
            decryptedKey = await cryptoService.decryptKey(
              encryptedKeys.invitationKey,
              contactPublicKey,
              privateKey,
            );
            console.log("invitation key decrypted: " + decryptedKey);
            const encryptedKey = await cryptoService.encryptKey(
              decryptedKey,
              publicKey,
              privateKey,
            );
            console.log("invitation key encrypted: " + encryptedKey);
            await contactRepository.updateContactKey(
              user,
              contactEmail,
              encryptedKey,
            );
            console.log("encrypted key stored.");
          } else {
            decryptedKey = await cryptoService.decryptKey(
              encryptedKeys.key,
              publicKey,
              privateKey,
            );
          }
          if (mounted) setSharedKey(decryptedKey);
        } catch (e) {
          console.error("Failed to load shared key", e);
        }
      };
      fetchKey();
    }
    return () => {
      mounted = false;
    };
  }, [user, contactEmail, publicKey, privateKey]);

  useEffect(() => {
    let mounted = true;

    const pollMessages = async () => {
      if (!user || !contactEmail || !sharedKey) return;
      let sinceId: string | undefined = undefined;

      while (mounted) {
        try {
          const newMessages = await messageRepository.receiveMessages(
            user,
            contactEmail,
            sinceId,
          );
          if (newMessages && newMessages.length > 0 && mounted) {
            const decryptedMessages = await Promise.all(
              newMessages.map(async (m) => ({
                id: m.id,
                content: await cryptoService.decryptMessage(
                  m.content,
                  sharedKey,
                ),
                isMine: false,
              })),
            );
            setMessages((prev) => {
              const existingIds = new Set(prev.map((p) => p.id));
              const uniqueNew = decryptedMessages.filter(
                (m) => !existingIds.has(m.id),
              );
              return [...prev, ...uniqueNew];
            });
            sinceId = newMessages[newMessages.length - 1].id;
          }
        } catch (e) {
          console.error(e);
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    };

    if (sharedKey) {
      pollMessages();
    }

    return () => {
      mounted = false;
    };
  }, [user, contactEmail, sharedKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !user || !contactEmail || !sharedKey) return;

    const messageText = inputMessage;
    setInputMessage("");
    try {
      const encryptedContent = await cryptoService.encryptMessage(
        messageText,
        sharedKey,
      );
      await messageRepository.sendMessage(user, contactEmail, encryptedContent);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "-" + Math.random().toString(),
          content: messageText,
          isMine: true,
        },
      ]);
    } catch (e) {
      console.error("Failed to send message", e);
      setInputMessage(messageText);
    }
  };

  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <h5 className="center-align" style={{ margin: "1rem 0" }}>
        {contactEmail}
      </h5>
      <div
        style={{
          flexGrow: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          padding: "1rem",
          paddingBottom: "1rem",
        }}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              padding: "0.75rem 1.25rem",
              borderRadius: "20px",
              borderBottomLeftRadius: m.isMine ? "20px" : "4px",
              borderBottomRightRadius: m.isMine ? "4px" : "20px",
              alignSelf: m.isMine ? "flex-end" : "flex-start",
              maxWidth: "80%",
              wordWrap: "break-word",
              background: m.isMine
                ? "var(--primary)"
                : "var(--surface-container-high)",
              color: m.isMine ? "var(--on-primary)" : "var(--on-surface)",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              transition: "transform 0.2s ease-out",
            }}
          >
            {m.content}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form
        onSubmit={handleSend}
        style={{
          display: "flex",
          gap: "0.5rem",
          padding: "1rem",
          borderTop: "1px solid var(--outline-variant)",
        }}
      >
        <input
          className="field border"
          style={{ flexGrow: 1 }}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={t("Type a message")}
        />
        <button type="submit" className="primary circle">
          <i>send</i>
        </button>
      </form>
    </main>
  );
}
