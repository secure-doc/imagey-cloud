import PasswordDialog from "./PasswordDialog";
import { deviceRepository } from "../device/DeviceRepository";
import { authenticationService } from "./AuthenticationService";
import { useTranslation } from "react-i18next";
import { deviceService } from "../device/DeviceService";

interface DeviceSetupDialogProperties {
  email: string;
  deviceId: string;
  onPrivateKeysDecrypted: (
    privateMainKey: JsonWebKey,
    privateDeviceKey: JsonWebKey,
  ) => void;
  onWrongUser: () => void;
}

export default function DeviceSetupDialog({
  email,
  deviceId,
  onPrivateKeysDecrypted,
  onWrongUser,
}: DeviceSetupDialogProperties) {
  const { t } = useTranslation();
  const encryptedPrivateDeviceKey = deviceRepository.loadKey(deviceId);
  if (!encryptedPrivateDeviceKey) {
    return (
      <dialog className="surface-bright" open>
        {t("Device key missing, please reregister device")}
      </dialog>
    );
  }
  return (
    <PasswordDialog<{
      privateMainKey: JsonWebKey;
      privateDeviceKey: JsonWebKey;
      password: string;
    }>
      message={t("Unlock this device")}
      email={email}
      onWrongUser={onWrongUser}
      showKeepLoggedIn
      validatePassword={(password) =>
        deviceService
          .unlockLocalDeviceKey(deviceId, password)
          .then((privateDeviceKey) =>
            authenticationService
              .loadPrivateMainKey(email, deviceId, privateDeviceKey)
              .then((privateMainKey) => ({
                privateMainKey,
                privateDeviceKey,
                password,
              })),
          )
      }
      onPasswordValid={async (
        { privateMainKey, privateDeviceKey, password },
        keepLoggedIn,
      ) => {
        if (keepLoggedIn) {
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
        onPrivateKeysDecrypted(privateMainKey, privateDeviceKey);
      }}
    />
  );
}
