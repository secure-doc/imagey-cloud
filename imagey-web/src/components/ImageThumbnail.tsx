import { useTranslation } from "react-i18next";

// The shared img/error-box/progress presentation for a loaded (or loading,
// or failed) image thumbnail - used by both ImageComponent and
// FolderEntryImageComponent, which differ only in how they fetch the
// underlying content (see useImageBlob).
export function ImageThumbnail({
  documentId,
  name,
  objectUrl,
  error,
  className = "small-width small-height",
}: {
  documentId: string;
  name: string;
  objectUrl: string | undefined;
  error: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  if (objectUrl) {
    return (
      <img
        key={documentId}
        src={objectUrl}
        alt={name}
        loading="lazy"
        className={className}
        style={{ objectFit: "cover" }}
      />
    );
  } else if (error) {
    return (
      <div
        key={documentId}
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
          {t("Error loading {{name}}", { name })}
        </div>
      </div>
    );
  } else {
    return (
      <div key={documentId} className={className}>
        <progress className="circle small"></progress>
      </div>
    );
  }
}
