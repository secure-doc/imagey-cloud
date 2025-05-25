import PasswordDialog from "./PasswordDialog";
import { deviceService } from "../device/DeviceService";
import { useState } from "react";

interface DeviceRegistrationDialogProperties {
  email: string;
  onKeyDecrypted: (key: JsonWebKey) => void;
}

export default function DeviceRegistrationDialog({
  email,
}: DeviceRegistrationDialogProperties) {
  const [message, setMessage] = useState<string>();
  if (message) {
    return <>{message}</>;
  }
  return (
    <PasswordDialog<string>
      message={"Select a password for this device"}
      validatePassword={(password) => Promise.resolve(password)}
      onPasswordValid={(password) => {
        deviceService
          .registerDevice(email, password)
          .then(() =>
            setMessage(
              "Device registered, you can now activate it with another device",
            ),
          );
      }}
    />
  );
}
