import PasswordDialog from "./PasswordDialog";
import { deviceRepository } from "../device/DeviceRepository";
import { authenticationService } from "./AuthenticationService";
import { useTranslation } from "react-i18next";
import { deviceService } from "../device/DeviceService";
import { UserId } from "./UserId";

interface DeviceSetupDialogProperties {
  userId: UserId;
  email?: string;
  deviceId: string;
  onPrivateKeysDecrypted: (
    privateMainKey: JsonWebKey,
    privateDeviceKey: JsonWebKey,
  ) => void;
  onWrongUser: () => void;
}

export default function DeviceSetupDialog({
  userId,
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
    }>
      message={t("Unlock this device")}
      email={email}
      showKeepLoggedIn
      onWrongUser={onWrongUser}
      validatePassword={async (password, keepLoggedIn) => {
        // We reach this dialog with a still-valid session (the public-key
        // lookup succeeded) - the in-memory key pair was just lost on the last
        // reload. Unlocking the local device key is enough to rebuild it.
        // Only when the user asks to stay signed in do we run the full
        // challenge/response: that is the only path that stores a recovery key
        // and upgrades the session to the persistent cookie, so that the next
        // reload logs in without a password.
        if (keepLoggedIn) {
          return authenticationService.authenticateWithChallenge(
            userId,
            deviceId,
            password,
            true,
          );
        }
        const privateDeviceKey = await deviceService.unlockLocalDeviceKey(
          deviceId,
          password,
        );
        const privateMainKey = await authenticationService.loadPrivateMainKey(
          userId,
          deviceId,
          privateDeviceKey,
        );
        return { privateMainKey, privateDeviceKey };
      }}
      onPasswordValid={({ privateMainKey, privateDeviceKey }) =>
        onPrivateKeysDecrypted(privateMainKey, privateDeviceKey)
      }
    />
  );
}
