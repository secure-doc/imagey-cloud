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
      onWrongUser={onWrongUser}
      validatePassword={(password) =>
        deviceService
          .unlockLocalDeviceKey(deviceId, password)
          .then((privateDeviceKey) =>
            authenticationService
              .loadPrivateMainKey(userId, deviceId, privateDeviceKey)
              .then((privateMainKey) => ({ privateMainKey, privateDeviceKey })),
          )
      }
      onPasswordValid={({ privateMainKey, privateDeviceKey }) =>
        onPrivateKeysDecrypted(privateMainKey, privateDeviceKey)
      }
    />
  );
}
