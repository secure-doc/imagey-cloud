import { useState } from "react";
import { useTranslation } from "react-i18next";
import { documentService } from "../document/DocumentService";
import Document from "../document/Document";
import { useAuthentication } from "../contexts/AuthenticationContext";

interface CreateFolderButtonProps {
  onFolderCreated: (folder: Document) => void;
}

export default function CreateFolderButton({
  onFolderCreated,
}: CreateFolderButtonProps) {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    const name = window.prompt(t("Enter folder name"));
    if (name && authentication.user) {
      setIsCreating(true);
      try {
        const metadata = await documentService.createFolder(
          authentication.user,
          name,
          authentication.keyPairs.mainKeyPair.publicKey,
          authentication.keyPairs.mainKeyPair.privateKey,
        );
        const newFolder: Document = {
          documentId: metadata.documentId,
          name: name,
          type: "folder",
          documentIds: [],
          _metadata: metadata,
        };
        onFolderCreated(newFolder);
      } catch (error) {
        console.error("Failed to create folder", error);
      } finally {
        setIsCreating(false);
      }
    }
  };

  return (
    <button
      onClick={handleCreate}
      disabled={isCreating}
      aria-label="create-folder"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        <line x1="12" y1="11" x2="12" y2="17"></line>
        <line x1="9" y1="14" x2="15" y2="14"></line>
      </svg>
    </button>
  );
}
