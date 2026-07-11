import PasswordDialog from "./PasswordDialog";
import { authenticationService } from "./AuthenticationService";
import { deviceRepository } from "../device/DeviceRepository";
import { useTranslation } from "react-i18next";
import { JsonWebKeyPairs } from "../contexts/AuthenticationContext";

interface RegistrationDialogProperties {
  email: string;
  onKeysDecrypted: (keyPairs: JsonWebKeyPairs) => void;
}

export default function RegistrationDialog({
  email,
  onKeysDecrypted,
}: RegistrationDialogProperties) {
  const { t } = useTranslation();
  const params = new URLSearchParams(window.location.search);
  const inviter = params.get("inviter") ?? undefined;
  return (
    <PasswordDialog<string>
      message={t("Select a password for this device")}
      email={email}
      requireConfirmation
      showKeepLoggedIn
      validatePassword={(password) => Promise.resolve(password)}
      onPasswordValid={(password, keepLoggedIn) => {
        authenticationService
          .register(email, password, inviter)
          .then(async (keyPairs) => {
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
            onKeysDecrypted(keyPairs);
          });
      }}
    />
  );
}
