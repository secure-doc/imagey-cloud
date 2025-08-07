import PasswordDialog from "./PasswordDialog";
import { authenticationService } from "./AuthenticationService";
import { useTranslation } from "react-i18next";

interface RegistrationDialogProperties {
  email: string;
  onKeyDecrypted: (publicKey: JsonWebKey, privateKey: JsonWebKey) => void;
}

export default function RegistrationDialog({
  email,
  onKeyDecrypted,
}: RegistrationDialogProperties) {
  const { t } = useTranslation();
  return (
    <PasswordDialog<string>
      message={t("Select a password for this device")}
      validatePassword={(password) => Promise.resolve(password)}
      onPasswordValid={(password) => {
        authenticationService
          .register(email, password)
          .then((keyPair) =>
            onKeyDecrypted(keyPair.publicKey, keyPair.privateKey),
          );
      }}
    />
  );
}
