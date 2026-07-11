import PasswordDialog from "./PasswordDialog";
import { deviceService } from "../device/DeviceService";
import { deviceRepository } from "../device/DeviceRepository";
import { authenticationService } from "./AuthenticationService";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { JsonWebKeyPair } from "../contexts/AuthenticationContext";

interface DeviceRegistrationDialogProperties {
  email: string;
  onKeysDecrypted: (
    privateMainKey: JsonWebKey,
    deviceKeyPair: JsonWebKeyPair,
  ) => void;
  onWrongUser: () => void;
}

export default function DeviceRegistrationDialog({
  email,
  onKeysDecrypted,
  onWrongUser,
}: DeviceRegistrationDialogProperties) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string>();
  const [unlockButtonText, setUnlockButtonText] = useState<string>(t("OK"));
  const [password, setPassword] = useState<string>();
  const [keepLoggedIn, setKeepLoggedIn] = useState<boolean>(false);
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
                .then(async (keys) => {
                  if (keepLoggedIn) {
                    const deviceId = deviceRepository.loadDeviceId(email);
                    if (deviceId) {
                      try {
                        await authenticationService.authenticateWithChallenge(
                          email,
                          deviceId,
                          password,
                          true,
                        );
                      } catch (e) {
                        console.warn("Failed to extend token to 30 days", e);
                      }
                    }
                  }
                  onKeysDecrypted(keys.privateMainKey, keys.deviceKeyPair);
                })
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
      email={email}
      onWrongUser={onWrongUser}
      requireConfirmation
      showKeepLoggedIn
      validatePassword={(password) => Promise.resolve(password)}
      onPasswordValid={(password, keepLoggedInValue) => {
        setPassword(password);
        setKeepLoggedIn(keepLoggedInValue);
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
