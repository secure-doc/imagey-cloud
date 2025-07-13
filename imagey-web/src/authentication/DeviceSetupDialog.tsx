import PasswordDialog from "./PasswordDialog";
import { deviceRepository } from "../device/DeviceRepository";
import { cryptoService } from "./CryptoService";
import { authenticationService } from "./AuthenticationService";

interface DeviceSetupDialogProperties {
  email: string;
  deviceId: string;
  onKeyDecrypted: (key: JsonWebKey) => void;
}

export default function DeviceSetupDialog({
  email,
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
      onPasswordValid={(privateDeviceKey) =>
        authenticationService
          .loadPrivateKey(email, deviceId, privateDeviceKey)
          .then((privateMainKey) => onKeyDecrypted(privateMainKey))
          .catch((e) => console.log(e))
      }
    />
  );
}
