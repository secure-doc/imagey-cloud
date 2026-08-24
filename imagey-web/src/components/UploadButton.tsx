import { useRef, useState } from "react";
import { documentService, StoreResult } from "../document/DocumentService";
import { useAuthentication } from "../contexts/AuthenticationContext";
import Document from "../document/Document";
import { useKey } from "../contexts/FolderContext";

export default function UploadButton({
  className,
  multiple,
  onUploadComplete,
  children,
  "aria-label": ariaLabel,
  folder,
  asMenuItem,
}: {
  className?: string;
  multiple?: boolean;
  onUploadComplete?: (result: StoreResult) => void;
  children?: React.ReactNode;
  "aria-label"?: string;
  folder: Document;
  asMenuItem?: boolean;
}) {
  const fileChooser = useRef<HTMLInputElement>(null);
  const authentication = useAuthentication();
  const user = authentication.user;
  const [isUploading, setIsUploading] = useState(false);
  const folderKey = useKey(folder.documentId);

  const handleUpload = async (files: File[]) => {
    if (!user || !folderKey) return;

    setIsUploading(true);
    try {
      for (const file of files) {
        if (file) {
          const result = await documentService.storeDocument(
            user,
            file,
            folder,
            folderKey,
          );
          if (onUploadComplete) {
            onUploadComplete(result);
          }
        }
      }
    } finally {
      setIsUploading(false);
    }
  };

  const commonProps = {
    className: className || "circle transparent",
    onClick: () => fileChooser.current?.click(),
    "aria-label": ariaLabel,
  };

  const innerContent = (
    <>
      {isUploading ? (
        <progress className="circle"></progress>
      ) : (
        children || <i>add</i>
      )}
      <input
        multiple={multiple ?? false}
        ref={fileChooser}
        type="file"
        name="images"
        accept="image/*"
        hidden
        onChange={(e) => {
          if (e.target.files) {
            handleUpload(Array.from(e.target.files));
            e.target.value = "";
          }
        }}
      />
    </>
  );

  if (asMenuItem) {
    return (
      <a
        {...commonProps}
        style={{
          cursor: isUploading ? "not-allowed" : "pointer",
          pointerEvents: isUploading ? "none" : "auto",
        }}
      >
        {innerContent}
      </a>
    );
  }

  return (
    <button type="button" disabled={isUploading} {...commonProps}>
      {innerContent}
    </button>
  );
}
