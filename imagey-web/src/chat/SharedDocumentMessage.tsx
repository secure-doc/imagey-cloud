import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { documentService } from "../document/DocumentService";
import { documentRepository } from "../document/DocumentRepository";
import DocumentMetadata from "../document/DocumentMetadata";
import ImageComponent from "../components/ImageComponent";
import { useAuthentication } from "../contexts/AuthenticationContext";

interface SharedDocumentMessageProps {
  documentId: string;
  owner: string;
  chatKey: JsonWebKey;
}

export function SharedDocumentMessage({
  documentId,
  owner,
  chatKey,
}: SharedDocumentMessageProps) {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const publicKey = authentication.keyPairs?.mainKeyPair.publicKey;
  const privateKey = authentication.keyPairs?.mainKeyPair.privateKey;

  const [document, setDocument] = useState<DocumentMetadata>();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (
      user &&
      chatKey &&
      publicKey &&
      privateKey &&
      authentication.settings?.settingsKey
    ) {
      const loadSharedDoc = async () => {
        if (user === owner) {
          const encryptedDocumentKey = await documentRepository.loadKey(
            user,
            documentId,
          );
          const folderId = encryptedDocumentKey.issuer;
          const folder = await documentService.getFolder(
            user,
            folderId,
            authentication.settings.settingsKey,
          );
          const folderKey = folder.key;

          return documentService.loadDocument(
            owner,
            documentId,
            folderId!,
            folderKey!,
          );
        } else {
          return documentService.loadSharedDocument(
            owner,
            documentId,
            chatKey,
            user,
          );
        }
      };

      loadSharedDoc()
        .then(setDocument)
        .catch((e) => {
          console.error("Failed to load shared document", e);
          setError(true);
        });
    }
  }, [
    user,
    owner,
    documentId,
    chatKey,
    publicKey,
    privateKey,
    authentication.settings?.settingsKey,
  ]);

  if (error) {
    return <div className="error">{t("Error loading shared document")}</div>;
  }

  if (!document) {
    return <progress className="circle" />;
  }

  return (
    <div className="shared-document">
      <ImageComponent image={document} className="responsive max" />
    </div>
  );
}
