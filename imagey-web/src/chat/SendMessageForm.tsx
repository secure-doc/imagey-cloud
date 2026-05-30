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
    <form onSubmit={handleSend} className="row padding">
      <input
        className="field border max"
        value={inputMessage}
        onChange={(e) => setInputMessage(e.target.value)}
        placeholder={t("Type a message")}
      />
      <button type="submit" className="primary circle">
        <i>send</i>
      </button>
    </form>
  );
}
