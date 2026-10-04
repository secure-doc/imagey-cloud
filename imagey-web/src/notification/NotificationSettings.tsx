import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { useBackButton } from "../contexts/ActionBarContext";
import { deviceRepository } from "../device/DeviceRepository";
import { SettingsList } from "../pages/Settings";
import {
  pushSubscriptionService,
  PushSupport,
} from "./PushSubscriptionService";

// The "Notifications" entry under Settings (ADR 0020): a single on/off
// switch for push on this device, plus a hint for whichever reason it cannot
// be turned on right now. Same page shell as Devices.tsx/ProfilePage.tsx -
// the settings list beside the content, inside the shared grid layout (its
// fixed left nav sits outside this grid, so content rendered without it
// ends up underneath that nav instead of beside it).
export default function NotificationSettings() {
  const { t } = useTranslation();
  useBackButton();
  const authentication = useAuthentication();
  const user = authentication.user;
  const deviceKeyPair = authentication.keyPairs?.deviceKeyPair;
  const deviceId = deviceRepository.loadDeviceId(user);
  const keepLoggedIn = deviceId
    ? !!deviceRepository.loadRecoveryKey(deviceId)
    : false;

  const [support, setSupport] = useState<PushSupport>("unsupported");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setSupport(pushSubscriptionService.support());
    if (deviceId) {
      pushSubscriptionService.isEnabled(deviceId).then(setEnabled);
    }
  }, [deviceId]);

  const handleToggle = async (checked: boolean) => {
    if (!deviceKeyPair) {
      return;
    }
    setBusy(true);
    setError(false);
    try {
      if (checked) {
        await pushSubscriptionService.enable(user, deviceKeyPair);
      } else {
        await pushSubscriptionService.disable(user, deviceKeyPair);
      }
      setEnabled(checked);
      setSupport(pushSubscriptionService.support());
    } catch (e) {
      console.error("Failed to update notification settings", e);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid no-margin">
      <SettingsList className="m l" />
      <section className="col scroll s12 m6 l6 padding">
        <h5>{t("Notifications")}</h5>
        {support === "needs-install" ? (
          <div>
            {t("Install this app to your home screen to enable notifications.")}
          </div>
        ) : support === "denied" ? (
          <div>
            {t(
              "Notifications are blocked. Enable them in your browser settings.",
            )}
          </div>
        ) : support === "unsupported" ? null : (
          <>
            <label className="switch icon">
              <input
                type="checkbox"
                checked={enabled}
                disabled={busy}
                onChange={(e) => handleToggle(e.target.checked)}
              />
              <span></span>
            </label>
            <div>{t("Notifications on this device")}</div>
            {enabled && !keepLoggedIn && (
              <div className="small-text">
                {t(
                  'Without "keep me logged in" you will only see "New message".',
                )}
              </div>
            )}
            {error && (
              <div className="error small-text">
                {t("Failed to update notification settings")}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
