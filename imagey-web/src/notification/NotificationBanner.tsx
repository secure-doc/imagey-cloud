import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { getAppName } from "../utils/appName";
import { pushSubscriptionService } from "./PushSubscriptionService";

const DISMISSED_KEY = "imagey.notificationBannerDismissed";

// A one-time opt-in prompt shown above the chat list (ADR 0020) while
// notifications are neither granted nor denied yet and the user has not
// dismissed it before. Enabling right from here (rather than only from
// Settings) keeps the permission request on a user gesture, which iOS
// requires.
export default function NotificationBanner() {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const deviceKeyPair = authentication.keyPairs?.deviceKeyPair;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISSED_KEY) === "true";
    setVisible(!dismissed && pushSubscriptionService.support() === "default");
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setVisible(false);
  };

  const enable = () => {
    if (!deviceKeyPair) {
      return;
    }
    pushSubscriptionService
      .enable(authentication.user, deviceKeyPair)
      .then(() => dismiss())
      .catch((e) => {
        console.error("Failed to enable notifications", e);
        setVisible(pushSubscriptionService.support() === "default");
      });
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="padding surface-variant no-round">
      <nav>
        <div className="max">
          {t(
            "Get notified about new messages, even when {{appName}} is closed.",
            {
              appName: getAppName(),
            },
          )}
        </div>
        <button className="border" onClick={dismiss}>
          {t("Not now")}
        </button>
        <button onClick={enable}>{t("Enable")}</button>
      </nav>
    </div>
  );
}
