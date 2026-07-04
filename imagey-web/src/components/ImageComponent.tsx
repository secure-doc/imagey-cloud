import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import DocumentMetadata from "../document/DocumentMetadata";
import { documentService } from "../document/DocumentService";
import { useAuthentication } from "../contexts/AuthenticationContext";

export default function ImageComponent({
  image,
  className = "small-width small-height",
}: {
  image: DocumentMetadata;
  className?: string;
}) {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const mainKeyPair = authentication.keyPairs.mainKeyPair;
  const publicMainKey = mainKeyPair?.publicKey;
  const privateMainKey = mainKeyPair?.privateKey;

  const [content, setContent] = useState<ArrayBuffer | undefined>();
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    // If it's already a Document with content, just use it
    if ("content" in image && image.content) {
      setContent(image.content as ArrayBuffer);
      return;
    }

    if (user && publicMainKey && privateMainKey) {
      documentService
        .loadDocumentContent(
          user,
          image,
          publicMainKey,
          privateMainKey,
          image.sharedKey,
        )
        .then((doc) => setContent(doc.content))
        .catch((e) => {
          console.error(e);
          setError(true);
        });
    }
  }, [user, image, publicMainKey, privateMainKey]);

  if (content) {
    const blob = new Blob([content], {
      type:
        image.type && image.type.startsWith("image/")
          ? "image/png"
          : image.type,
    });
    const url = URL.createObjectURL(blob);
    return (
      <img
        key={image.documentId}
        src={url}
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
