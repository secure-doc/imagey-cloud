import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Message } from "./Message";
import { servicesFor } from "../api/servicesFor";
import { documentService } from "../document/DocumentService";
import { useDocumentsId, useSettingsKey } from "../contexts/SettingsContext";

import DocumentMetadata from "../document/DocumentMetadata";
import ImageComponent from "../components/ImageComponent";

interface SendMessageFormProps {
  userId: string;
  // The own id on the chat's server (`chatOrigin`) - the sender of the messages there;
  // `userId` (the own id here) is the owner of the documents shared into the chat.
  selfId?: string;
  // The server the chat lives on (undefined = own server).
  chatOrigin?: string;
  ownerId: string;
  chatId: string;
  sharedKey: JsonWebKey;
  onMessageSent: (message: Message) => void;
  // The other chat members to push-notify (ADR 0020) - passed straight
  // through to messageService.sendEncryptedMessage.
  notify: string[];
  // Grants access to a document being shared into this conversation - a 1:1
  // chat wraps its key for the contact (documentService.shareDocument);
  // a group wraps it once for the whole group
  // (groupService.shareDocumentIntoGroup, ADR 0019 decision 4). The message
  // itself is always the same "shared-document" convention either way.
  share: (document: DocumentMetadata) => Promise<void>;
  // Sharing is not possible (a contact on another server without a known address, F8).
  shareDisabled?: boolean;
  // Why, as the button's tooltip.
  shareDisabledHint?: string;
}

export function SendMessageForm({
  userId,
  selfId = userId,
  chatOrigin,
  ownerId,
  chatId,
  sharedKey,
  onMessageSent,
  notify,
  share,
  shareDisabled = false,
  shareDisabledHint,
}: SendMessageFormProps) {
  const { t } = useTranslation();
  const documentsId = useDocumentsId();
  const settingsKey = useSettingsKey();

  const [inputMessage, setInputMessage] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [documents, setDocuments] = useState<DocumentMetadata[] | undefined>();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (showDialog && !documents && userId && settingsKey) {
      documentService
        .loadFolderChildren(userId, documentsId, userId, settingsKey)
        .then((docs) => setDocuments(docs))
        .catch(console.error);
    }
  }, [showDialog, documents, userId, documentsId, settingsKey]);

  useEffect(() => {
    if (showDialog) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [showDialog]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !userId || !sharedKey) return;

    const messageText = inputMessage;
    setInputMessage("");
    try {
      const newMessage = await servicesFor(
        chatOrigin,
      ).messages.sendEncryptedMessage(
        selfId,
        ownerId,
        chatId,
        messageText,
        sharedKey,
        notify,
      );
      onMessageSent(newMessage);
    } catch (e) {
      console.error("Failed to send message", e);
      setInputMessage(messageText);
    }
  };

  const handleShareDocument = async (document: DocumentMetadata) => {
    setShowDialog(false);
    try {
      await share(document);

      const payload = JSON.stringify({
        type: "shared-document",
        documentId: document.documentId,
        owner: userId,
        // The document stays on our server: say so if that is not the chat's.
        ...(chatOrigin ? { origin: window.location.origin } : {}),
      });

      const newMessage = await servicesFor(
        chatOrigin,
      ).messages.sendEncryptedMessage(
        selfId,
        ownerId,
        chatId,
        payload,
        sharedKey,
        notify,
      );
      onMessageSent(newMessage);
    } catch (e) {
      console.error("Failed to share document", e);
    }
  };

  return (
    <>
      <form
        onSubmit={handleSend}
        className="padding surface-container no-margin"
      >
        <nav>
          <button
            type="button"
            className="circle transparent"
            disabled={shareDisabled}
            title={
              shareDisabled
                ? (shareDisabledHint ??
                  t("Sharing is not possible for this contact"))
                : undefined
            }
            onClick={() => setShowDialog(true)}
          >
            <i>attach_file</i>
          </button>
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
      <dialog ref={dialogRef} className="max">
        <h5 className="margin">{t("Share Document")}</h5>
        <div className="padding scroll" style={{ maxHeight: "60vh" }}>
          {!documents ? (
            <progress className="circle" />
          ) : documents.length === 0 ? (
            <div>{t("No documents available")}</div>
          ) : (
            <div className="column">
              {documents.map((doc) => (
                <a
                  key={doc.documentId}
                  onClick={(e) => {
                    e.preventDefault();
                    handleShareDocument(doc);
                  }}
                  className="pointer"
                >
                  <ImageComponent image={doc} />
                </a>
              ))}
            </div>
          )}
        </div>
        <nav className="right-align">
          <button className="transparent" onClick={() => setShowDialog(false)}>
            {t("Cancel")}
          </button>
        </nav>
      </dialog>
    </>
  );
}
