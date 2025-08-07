import { useTranslation } from "react-i18next";

export default function Image() {
  const { t } = useTranslation();
  return (
    <main>
      <p>{t("No image found")}</p>
    </main>
  );
}
