import PasswordDialog from "./PasswordDialog";
import { authenticationService } from "./AuthenticationService";
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
  return (
    <PasswordDialog<string>
      message={t("Select a password for this device")}
      validatePassword={(password) => Promise.resolve(password)}
      onPasswordValid={(password) => {
        authenticationService
          .register(email, password)
          .then((keyPairs) => onKeysDecrypted(keyPairs));
      }}
    />
  );
}
