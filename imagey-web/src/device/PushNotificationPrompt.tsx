import { useTranslation } from "react-i18next";

interface PushNotificationPromptProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PushNotificationPrompt({
  onConfirm,
  onCancel,
}: PushNotificationPromptProps) {
  const { t } = useTranslation();

  return (
    <dialog className="surface-bright active" open>
      <h5 className="primary-text">{t("Enable Notifications")}</h5>
      <p>{t("Do you want to be notified when you receive new messages?")}</p>
      <nav className="right-align no-space">
        <button className="transparent link" type="button" onClick={onCancel}>
          {t("No")}
        </button>
        <button className="transparent link" type="button" onClick={onConfirm}>
          {t("Yes")}
        </button>
      </nav>
    </dialog>
  );
}
