import { useRef, useState } from "react";
import { documentService } from "../document/DocumentService";
import { useAuthentication } from "../contexts/AuthenticationContext";
import DocumentMetadata from "../document/DocumentMetadata";

export default function UploadButton({
  className,
  multiple,
  onUploadComplete,
  children,
  "aria-label": ariaLabel,
}: {
  className?: string;
  multiple?: boolean;
  onUploadComplete?: (document: DocumentMetadata) => void;
  children?: React.ReactNode;
  "aria-label"?: string;
}) {
  const fileChooser = useRef<HTMLInputElement>(null);
  const authentication = useAuthentication();
  const user = authentication.user;
  const mainKeyPair = authentication.keyPairs.mainKeyPair;
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (files: File[]) => {
    if (!user || !mainKeyPair) return;
    const publicMainKey = mainKeyPair.publicKey;
    const privateMainKey = mainKeyPair.privateKey;

    setIsUploading(true);
    for (const file of files) {
      if (file) {
        const metadata = await documentService.storeDocument(
          user,
          file,
          publicMainKey,
          privateMainKey,
        );
        if (onUploadComplete) {
          onUploadComplete(metadata);
        }
      }
    }
    setIsUploading(false);
  };

  return (
    <button
      type="button"
      className={className || "circle transparent"}
      onClick={() => fileChooser.current?.click()}
      disabled={isUploading}
      aria-label={ariaLabel}
    >
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
    </button>
  );
}
