import PasswordDialog from "./PasswordDialog";
import { deviceRepository } from "../device/DeviceRepository";
import { cryptoService } from "./CryptoService";

interface DeviceSetupDialogProperties {
  email: string;
  deviceId: string;
  onKeyDecrypted: (key: JsonWebKey) => void;
}

export default function DeviceSetupDialog({
  deviceId,
  onKeyDecrypted,
}: DeviceSetupDialogProperties) {
  const encryptedPrivateDeviceKey = deviceRepository.loadKey(deviceId);
  if (!encryptedPrivateDeviceKey) {
    return <>{"Device key missing, please reregister device"}</>;
  }
  return (
    <PasswordDialog<JsonWebKey>
      message={"Input the password for this device"}
      validatePassword={(password) =>
        cryptoService.decryptPrivatePasswordKey(
          encryptedPrivateDeviceKey,
          password,
        )
      }
      onPasswordValid={(key) => onKeyDecrypted(key)}
    />
  );
}
