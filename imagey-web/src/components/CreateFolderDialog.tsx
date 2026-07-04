import { useState } from "react";
import { useTranslation } from "react-i18next";
import { documentService } from "../document/DocumentService";
import { useAuthentication } from "../contexts/AuthenticationContext";
import DocumentMetadata from "../document/DocumentMetadata";

interface CreateFolderDialogProps {
  parentFolderId?: string;
  parentFolderKey?: JsonWebKey;
  onClose: () => void;
  onCreated: (folder: DocumentMetadata) => void;
}

export default function CreateFolderDialog({
  parentFolderId,
  parentFolderKey,
  onClose,
  onCreated,
}: CreateFolderDialogProps) {
  const { t } = useTranslation();
  const [folderName, setFolderName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const authentication = useAuthentication();
  const user = authentication.user;
  const mainKeyPair = authentication.keyPairs.mainKeyPair;

  const handleCreate = async () => {
    if (!folderName.trim() || !user || !mainKeyPair) return;
    setIsCreating(true);
    try {
      const publicMainKey = mainKeyPair.publicKey;
      const privateMainKey = mainKeyPair.privateKey;
      const metadata = await documentService.storeFolder(
        user,
        folderName.trim(),
        publicMainKey,
        privateMainKey,
        parentFolderId,
        parentFolderKey,
      );
      onCreated(metadata);
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreating(false);
      onClose();
    }
  };

  return (
    <>
      <div className="overlay active" onClick={onClose}></div>
      <dialog className="surface-bright active" open>
        <h5>{t("Create Folder")}</h5>
        <div className="field border">
          <input
            type="text"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            disabled={isCreating}
            placeholder={t("Folder Name")}
            autoFocus
          />
        </div>
        <nav className="right-align">
          <button
            className="transparent"
            onClick={onClose}
            disabled={isCreating}
          >
            {t("Cancel")}
          </button>
          <button
            onClick={handleCreate}
            disabled={!folderName.trim() || isCreating}
          >
            {isCreating ? (
              <progress className="circle small"></progress>
            ) : (
              t("Create")
            )}
          </button>
        </nav>
      </dialog>
    </>
  );
}
