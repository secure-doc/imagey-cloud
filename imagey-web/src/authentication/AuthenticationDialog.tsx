import { useEffect, useState } from "react";
import { deviceRepository } from "../device/DeviceRepository";
import EmailDialog from "./EmailDialog";
import PasswordDialog from "./PasswordDialog";
import { deviceService } from "../device/DeviceService";
import { AuthenticationError } from "./AuthenticationError";
import {
  authenticationService,
  RegistrationResult,
} from "./AuthenticationService";

interface AuthenticationDialogProperties {
  onKeyDecrypted: (key: JsonWebKey) => void;
}

export default function AuthenticationDialog({
  onKeyDecrypted,
}: AuthenticationDialogProperties) {
  const params = new URLSearchParams(window.location.search);
  const [user, setUser] = useState(
    params.get("email") ?? deviceRepository.loadUser(),
  );
  const [deviceId, setDeviceId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [passwordMessage, setPasswordMessage] = useState<string>();
  useEffect(() => {
    if (user) {
      setDeviceId(deviceRepository.loadDeviceId(user));
    }
  }, [user]);
  if (message) {
    return <>{message}</>;
  }
  if (!user) {
    return <EmailDialog onEmailSelected={(email) => setUser(email)} />;
  }
  const handleAuthenticationError = (
    authenticationError: AuthenticationError,
  ) => {
    switch (authenticationError) {
      case AuthenticationError.WRONG_PASSWORD: {
        setPasswordMessage("Wrong password, please try again");
        break;
      }
      case AuthenticationError.PRIVATE_KEY_MISSING:
        setPasswordMessage("Private key missing, a new one will be created");
        deviceRepository.clearDeviceId(user);
        setDeviceId(undefined);
        break;
      case AuthenticationError.UNAUTHORIZED: {
        authenticationService
          .register(user)
          .then((registrationResult: RegistrationResult) => {
            if (registrationResult === RegistrationResult.RegistrationStarted) {
              setMessage("A mail was sent to register");
            } else {
              setMessage("A mail was sent to login");
            }
          });
        break;
      }
      case AuthenticationError.FORBIDDEN: {
        setMessage(
          "This device is authenticated for another user. Please log out and relogin",
        );
        break;
      }
      case AuthenticationError.UNKNOWN:
      default: {
        setMessage("Unknown Error");
        break;
      }
    }
  };
  if (!deviceId) {
    return (
      <PasswordDialog
        message={passwordMessage ? passwordMessage : "Select device password"}
        onPasswordSelected={(password) =>
          deviceService
            .registerDevice(user, password)
            .then((key) => {
              setDeviceId(deviceRepository.loadDeviceId(user));
              onKeyDecrypted(key);
            })
            .catch((e) => handleAuthenticationError(e))
        }
      />
    );
  }
  return (
    <PasswordDialog
      message={passwordMessage ? passwordMessage : "Input device password"}
      onPasswordSelected={(password) =>
        deviceService
          .setupDevice(user, password)
          .then((key) => {
            onKeyDecrypted(key);
          })
          .catch((e) => handleAuthenticationError(e))
      }
    />
  );
}
