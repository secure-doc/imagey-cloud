import PasswordDialog from "./PasswordDialog";
import { deviceRepository } from "../device/DeviceRepository";
import { cryptoService } from "./CryptoService";
import { authenticationService } from "./AuthenticationService";
import { useTranslation } from "react-i18next";

interface DeviceSetupDialogProperties {
  email: string;
  deviceId: string;
  onPrivateKeysDecrypted: (
    privateMainKey: JsonWebKey,
    privateDeviceKey: JsonWebKey,
  ) => void;
}

export default function DeviceSetupDialog({
  email,
  deviceId,
  onPrivateKeysDecrypted,
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
    <PasswordDialog<JsonWebKey>
      message={t("Input the password for this device")}
      validatePassword={(password) =>
        cryptoService.decryptPrivatePasswordKey(
          encryptedPrivateDeviceKey,
          password,
        )
      }
      onPasswordValid={(privateDeviceKey) =>
        authenticationService
          .loadPrivateMainKey(email, deviceId, privateDeviceKey)
          .then((privateMainKey) =>
            onPrivateKeysDecrypted(privateMainKey, privateDeviceKey),
          )
      }
    />
  );
}
