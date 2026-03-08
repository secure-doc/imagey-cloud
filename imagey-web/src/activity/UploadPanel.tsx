import { useTranslation } from "react-i18next";

export default function UploadPanel({
  className = "",
}: {
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <article className={className}>
      <div className="padding center-align">
        <i className="extra">upload</i>
        <h5 className="max truncate center-align">{t("Upload Images")}</h5>
        <p>{t("Click the + button below to upload your first image.")}</p>
      </div>
    </article>
  );
}
