import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Message } from "./Message";
import { messageService } from "./MessageService";

interface SendMessageFormProps {
  userEmail: string;
  contactEmail: string;
  sharedKey: JsonWebKey;
  onMessageSent: (message: Message) => void;
}

export function SendMessageForm({
  userEmail,
  contactEmail,
  sharedKey,
  onMessageSent,
}: SendMessageFormProps) {
  const { t } = useTranslation();
  const [inputMessage, setInputMessage] = useState("");

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !userEmail || !contactEmail || !sharedKey)
      return;

    const messageText = inputMessage;
    setInputMessage("");
    try {
      const newMessage = await messageService.sendEncryptedMessage(
        userEmail,
        contactEmail,
        messageText,
        sharedKey,
      );
      onMessageSent(newMessage);
    } catch (e) {
      console.error("Failed to send message", e);
      setInputMessage(messageText);
    }
  };

  return (
    <form onSubmit={handleSend} className="padding surface-container no-margin">
      <nav>
        <div className="field label border round max no-margin">
          <input
            id="chat-input"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder=" "
          />
          <label htmlFor="chat-input">{t("Type a message")}</label>
        </div>
        <button type="submit" className="circle transparent">
          <i>send</i>
        </button>
      </nav>
    </form>
  );
}
