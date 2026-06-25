import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { documentService } from "../document/DocumentService";
import { documentRepository } from "../document/DocumentRepository";
import Document from "../document/Document";
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

  const [document, setDocument] = useState<Document>();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (user && chatKey && publicKey && privateKey) {
      documentRepository
        .loadDocumentMetadata(owner, documentId)
        .then((metadata) => {
          if (user === owner) {
            return documentService.loadDocument(
              owner,
              metadata,
              publicKey,
              privateKey,
            );
          } else {
            return documentService.loadSharedDocument(
              owner,
              metadata,
              chatKey,
              user,
            );
          }
        })
        .then(setDocument)
        .catch(() => setError(true));
    }
  }, [user, owner, documentId, chatKey, publicKey, privateKey]);

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
