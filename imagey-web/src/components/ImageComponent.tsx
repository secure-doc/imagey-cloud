import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { documentService } from "../document/DocumentService";
import { useObjectUrl } from "../hooks/useObjectUrl";
import { NewDocumentMetadata } from "../document/DocumentMetadata";

// Renders an already-loaded Document (has its own `key`) or a
// freshly-uploaded NewDocumentMetadata (no `revision` yet) - used by the
// chat message view and the share dialog, both of which already have a
// fully resolved document in hand. For a folder grid entry that has NOT
// been loaded (only its FolderEntry is known), use FolderEntryImageComponent
// instead.
export default function ImageComponent({
  image,
  contentId,
  accessPath,
  className = "small-width small-height",
}: {
  image: NewDocumentMetadata;
  contentId?: string;
  accessPath?: string;
  className?: string;
}) {
  const { t } = useTranslation();

  const [content, setContent] = useState<ArrayBuffer | undefined>();
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    // A reused/re-ordered slot may hand this component a different `image` -
    // clear the previous document's resolved content and error state so it
    // doesn't show through while the new content loads.
    setContent(undefined);
    setError(false);

    documentService
      .loadContent(image, contentId, accessPath)
      .then((content) => setContent(content))
      .catch((e) => {
        console.error("Error loading image content", e);
        setError(true);
      });
  }, [image, contentId, accessPath]);

  const mimeType = "mimeType" in image ? image.mimeType : undefined;
  const blob = useMemo(
    () =>
      content
        ? new Blob([content], {
            type: mimeType?.startsWith("image/") ? "image/png" : mimeType,
          })
        : undefined,
    [content, mimeType],
  );
  const objectUrl = useObjectUrl(blob);

  if (objectUrl) {
    return (
      <img
        key={image.documentId}
        src={objectUrl}
        alt={image.name}
        loading="lazy"
        className={className}
        style={{ objectFit: "cover" }}
      />
    );
  } else if (error) {
    return (
      <div
        key={image.documentId}
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
          {t("Error loading {{name}}", { name: image.name })}
        </div>
      </div>
    );
  } else {
    return (
      <div key={image.documentId} className={className}>
        <progress className="circle small"></progress>
      </div>
    );
  }
}
