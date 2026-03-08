import { useTranslation } from "react-i18next";
import Document from "../document/Document";

export default function ImageComponent({ image }: { image: Document }) {
  const { t } = useTranslation();
  const content = image.content;
  if (content) {
    const blob = new Blob([content]);
    const url = URL.createObjectURL(blob);
    return (
      <img
        key={image.documentId}
        src={url}
        alt={image.name}
        loading="lazy"
        className="small-width small-height"
      />
    );
  } else {
    return (
      <div key={image.documentId} className="small-width small-height">
        {t("Error loading {{name}}", { name: image.name })}
      </div>
    );
  }
}
