import Document from "../document/Document";
import { useTranslation } from "react-i18next";

interface FolderComponentProps {
  folder: Document;
  onClick: (folderId: string) => void;
  onDropDocument?: (folderId: string, documentId: string) => void;
}

export default function FolderComponent({
  folder,
  onClick,
  onDropDocument,
}: FolderComponentProps) {
  const { t } = useTranslation();

  return (
    <div
      className="folder-card"
      onClick={() => onClick(folder.documentId)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const documentId = e.dataTransfer.getData("documentId");
        if (documentId && onDropDocument) {
          onDropDocument(folder.documentId, documentId);
        }
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        cursor: "pointer",
        border: "1px solid #ccc",
        borderRadius: "8px",
        margin: "10px",
        width: "150px",
        height: "150px",
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>
      <div
        style={{
          marginTop: "10px",
          textAlign: "center",
          wordBreak: "break-all",
        }}
      >
        {folder.name || t("Unnamed Folder")}
      </div>
    </div>
  );
}
