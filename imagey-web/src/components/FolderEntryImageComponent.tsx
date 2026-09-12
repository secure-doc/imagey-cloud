import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { documentService } from "../document/DocumentService";
import { useObjectUrl } from "../hooks/useObjectUrl";
import { FolderEntry } from "../document/DocumentMetadata";

// Renders one folder grid entry's thumbnail directly off the FolderEntry
// embedded in the parent folder - no per-child metadata+key request (see
// documentService.loadFolderEntryContent), unlike ImageComponent which
// needs an already-loaded Document.
export default function FolderEntryImageComponent({
  entry,
  folderOwner,
  folderKey,
  accessPath,
  className = "small-width small-height",
}: {
  entry: FolderEntry;
  folderOwner: string;
  folderKey: JsonWebKey;
  accessPath?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState<ArrayBuffer | undefined>();
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    setContent(undefined);
    setError(false);
    documentService
      .loadFolderEntryContent(folderOwner, entry, folderKey, accessPath)
      .then((content) => setContent(content))
      .catch((e) => {
        console.error("Error loading image content", e);
        setError(true);
      });
  }, [folderOwner, entry, folderKey, accessPath]);

  const blob = useMemo(
    () =>
      content
        ? new Blob([content], {
            type: entry.mimeType?.startsWith("image/")
              ? "image/png"
              : entry.mimeType,
          })
        : undefined,
    [content, entry.mimeType],
  );
  const objectUrl = useObjectUrl(blob);

  if (objectUrl) {
    return (
      <img
        key={entry.documentId}
        src={objectUrl}
        alt={entry.name}
        loading="lazy"
        className={className}
        style={{ objectFit: "cover" }}
      />
    );
  } else if (error) {
    return (
      <div
        key={entry.documentId}
        className={`${className} border surface-container-highest center-align`}
        style={{
          display: "inline-flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          verticalAlign: "top",
          boxSizing: "border-box",
          margin: 0,
          padding: "0.5rem",
          textAlign: "center",
        }}
      >
        <i className="error-text">error</i>
        <div
          className="small"
          style={{
            marginTop: "0.5rem",
            wordBreak: "break-word",
            maxWidth: "100%",
          }}
        >
          {t("Error loading {{name}}", { name: entry.name })}
        </div>
      </div>
    );
  } else {
    return (
      <div key={entry.documentId} className={className}>
        <progress className="circle small"></progress>
      </div>
    );
  }
}
