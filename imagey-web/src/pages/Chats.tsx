import { useTranslation } from "react-i18next";

export default function Chats() {
  const { t } = useTranslation();
  return (
    <main>
      <p>{t("No chats available")}</p>
    </main>
  );
}
