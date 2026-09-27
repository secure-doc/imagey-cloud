import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useContext } from "react";
import { useNavigate } from "react-router";
import { ImageContext } from "../contexts/ImageContext";
import { documentService } from "../document/DocumentService";
import Document from "../document/Document";
import ImageComponent from "../components/ImageComponent";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { useDocumentsId } from "../contexts/SettingsContext";
import { useAccessPath, useKey } from "../contexts/FolderContext";

interface SharedDocumentMessageProps {
  documentId: string;
  owner: string;
  chatKey: JsonWebKey;
  contactUserId: string;
}

export function SharedDocumentMessage({
  documentId,
  owner,
  chatKey,
  contactUserId,
}: SharedDocumentMessageProps) {
  const { registerImage } = useContext(ImageContext);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;

  // Loading a shared document is just loading a document whose key is
  // wrapped by a different "parent" than usual:
  // - the owner viewing their own share already has it in their own root
  //   folder, so the normal root-folder key unlocks it, exactly like any
  //   other document in that folder.
  // - anyone else only has the key entry that was written for them
  //   specifically when the document was shared (keys/{their own email}),
  //   wrapped with the chat's shared symmetric key instead of a folder key.
  // Both hooks are called unconditionally (rules of hooks) and we simply
  // pick which result to use.
  const documentsId = useDocumentsId();
  const rootFolderKey = useKey(documentsId);
  const isOwner = user === owner;
  const parentId = isOwner ? documentsId : user;
  const parentKey = isOwner ? rootFolderKey : chatKey;

  // A chat share is a direct grant (issuer == kid == viewer), so this resolves
  // to undefined and no header is sent; kept so a future folder-share view goes
  // through one code path.
  const accessPath = useAccessPath(documentId, owner);

  const [document, setDocument] = useState<Document>();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (user && parentId && parentKey) {
      documentService
        .loadDocument(
          owner,
          documentId,
          parentId,
          parentKey,
          undefined,
          accessPath,
        )
        .then((doc) => setDocument(doc))
        .catch(() => setError(true));
    }
  }, [user, owner, documentId, parentId, parentKey, accessPath]);

  if (error) {
    return <div className="error">{t("Error loading shared document")}</div>;
  }

  if (!document) {
    return <progress className="circle" />;
  }

  const openImage =
    document.type === "image"
      ? () => {
          registerImage({
            documentId: document.documentId,
            name: document.name,
            owner: document.owner,
            documentKey: document.key,
            mediumImageId: document.mediumImageId,
            smallImageId: document.smallImageId,
            mimeType: document.mimeType,
            accessPath,
          });
          navigate(
            `/images/${document.documentId}?chat=${encodeURIComponent(
              contactUserId,
            )}&owner=${encodeURIComponent(document.owner)}`,
          );
        }
      : undefined;

  return (
    <div className="shared-document">
      <ImageComponent
        image={document}
        contentId={
          document.type === "image" ? document.smallImageId : undefined
        }
        accessPath={accessPath}
        className="responsive max"
        onClick={openImage}
      />
    </div>
  );
}
