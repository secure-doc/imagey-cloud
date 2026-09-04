import { useState } from "react";
import { useTranslation } from "react-i18next";
import { documentService, StoreResult } from "../document/DocumentService";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { useAccessPath } from "../contexts/FolderContext";
import Document from "../document/Document";

interface CreateFolderDialogProps {
  // The already-loaded parent folder Document (name, type, its existing
  // `documents` list, ...) - storeFolder() re-uploads this whole object
  // (with the new child id appended) as the parent's updated metadata, so
  // a stub carrying only documentId/documents would silently wipe out the
  // parent's real name/type on every subfolder creation.
  parentFolder?: Document;
  parentFolderKey?: JsonWebKey;
  onClose: () => void;
  onCreated: (result: StoreResult) => void;
}

export default function CreateFolderDialog({
  parentFolder,
  parentFolderKey,
  onClose,
  onCreated,
}: CreateFolderDialogProps) {
  const { t } = useTranslation();
  const [folderName, setFolderName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const authentication = useAuthentication();
  const user = authentication.user;
  // Set only when the parent folder was reached through a contact's shared
  // tree (ADR 0009); undefined for our own folders, where the server's
  // direct-grant scan needs no header.
  const accessPath = useAccessPath(
    parentFolder?.documentId ?? "",
    parentFolder?.owner ?? "",
  );

  const handleCreate = async () => {
    if (!folderName.trim() || !user || !parentFolder || !parentFolderKey)
      return;
    setIsCreating(true);
    try {
      const result = await documentService.storeFolder(
        user,
        folderName.trim(),
        parentFolder,
        parentFolderKey,
        accessPath,
      );
      onCreated(result);
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
