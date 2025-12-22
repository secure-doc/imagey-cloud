import PasswordDialog from "./PasswordDialog";
import { deviceService } from "../device/DeviceService";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { JsonWebKeyPair } from "../contexts/AuthenticationContext";

interface DeviceRegistrationDialogProperties {
  email: string;
  onKeysDecrypted: (
    privateMainKey: JsonWebKey,
    deviceKeyPair: JsonWebKeyPair,
  ) => void;
}

export default function DeviceRegistrationDialog({
  email,
  onKeysDecrypted,
}: DeviceRegistrationDialogProperties) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string>();
  const [unlockButtonText, setUnlockButtonText] = useState<string>(t("OK"));
  const [password, setPassword] = useState<string>();
  if (message && password) {
    return (
      <dialog className="surface-bright" open>
        <h5 className="primary-text">{t("Device registered")}</h5>
        <div className="field label border">{message}</div>
        <nav className="right-align no-space">
          <button
            className="transparent link"
            onClick={() =>
              deviceService
                .unlockDevice(email, password)
                .then((keys) =>
                  onKeysDecrypted(keys.privateMainKey, keys.deviceKeyPair),
                )
                .catch(() => {
                  setMessage(
                    t(
                      "Device registered, but still not unlocked. You need to unlock it with another device",
                    ),
                  );
                  setUnlockButtonText(t("Retry"));
                })
            }
          >
            {unlockButtonText}
          </button>
        </nav>
      </dialog>
    );
  }
  return (
    <PasswordDialog<string>
      message={t("Select a password for this device")}
      validatePassword={(password) => Promise.resolve(password)}
      onPasswordValid={(password) => {
        setPassword(password);
        deviceService
          .registerDevice(email, password)
          .then(() =>
            setMessage(
              t(
                "Device registered, you can now activate it with another device",
              ),
            ),
          );
      }}
    />
  );
}
