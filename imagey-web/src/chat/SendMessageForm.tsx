import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Message } from "./Message";
import { messageService } from "./MessageService";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { documentService } from "../document/DocumentService";

import DocumentMetadata from "../document/DocumentMetadata";
import ImageList from "../components/ImageList";

interface SendMessageFormProps {
  userEmail: string;
  contactEmail: string;
  chatDocumentId: string;
  sharedKey: JsonWebKey;
  onMessageSent: (message: Message) => void;
}

export function SendMessageForm({
  userEmail,
  contactEmail,
  chatDocumentId,
  sharedKey,
  onMessageSent,
}: SendMessageFormProps) {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const publicKey = authentication.keyPairs?.mainKeyPair.publicKey;
  const privateKey = authentication.keyPairs?.mainKeyPair.privateKey;

  const [inputMessage, setInputMessage] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [documents, setDocuments] = useState<DocumentMetadata[] | undefined>();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (showDialog && !documents && publicKey && privateKey) {
      documentService
        .getRootFolder(userEmail, publicKey, privateKey)
        .then((rootFolder) => {
          return documentService.loadDocuments(
            userEmail,
            publicKey,
            privateKey,
            rootFolder.documentId,
            rootFolder.key,
          );
        })
        .then((docs) => setDocuments(docs))
        .catch(console.error);
    }
  }, [showDialog, documents, userEmail, publicKey, privateKey]);

  useEffect(() => {
    if (showDialog) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [showDialog]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !userEmail || !chatDocumentId || !sharedKey)
      return;

    const messageText = inputMessage;
    setInputMessage("");
    try {
      const newMessage = await messageService.sendEncryptedMessage(
        userEmail,
        chatDocumentId,
        messageText,
        sharedKey,
      );
      onMessageSent(newMessage);
    } catch (e) {
      console.error("Failed to send message", e);
      setInputMessage(messageText);
    }
  };

  const handleShareDocument = async (document: DocumentMetadata) => {
    setShowDialog(false);
    if (!publicKey || !privateKey) return;
    try {
      await documentService.shareDocument(
        userEmail,
        document,
        contactEmail,
        sharedKey,
      );

      const payload = JSON.stringify({
        type: "shared-document",
        documentId: document.documentId,
        owner: userEmail,
      });

      const newMessage = await messageService.sendEncryptedMessage(
        userEmail,
        chatDocumentId,
        payload,
        sharedKey,
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
            <ImageList
              documents={documents}
              onImageClick={handleShareDocument}
            />
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
