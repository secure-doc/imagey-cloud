import { useTranslation } from "react-i18next";
import Document from "../document/Document";

export default function ImageComponent({
  image,
  className = "small-width small-height",
}: {
  image: Document;
  className?: string;
}) {
  const { t } = useTranslation();
  const content = image.content;
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
      />
    );
  } else {
    return (
      <div key={image.documentId} className={className}>
        {t("Error loading {{name}}", { name: image.name })}
      </div>
    );
  }
}
