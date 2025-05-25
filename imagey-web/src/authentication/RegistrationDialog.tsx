import PasswordDialog from "./PasswordDialog";
import { authenticationService } from "./AuthenticationService";

interface RegistrationDialogProperties {
  email: string;
  onKeyDecrypted: (key: JsonWebKey) => void;
}

export default function RegistrationDialog({
  email,
  onKeyDecrypted,
}: RegistrationDialogProperties) {
  return (
    <PasswordDialog<string>
      message={"Select a password for this device"}
      validatePassword={(password) => Promise.resolve(password)}
      onPasswordValid={(password) => {
        authenticationService
          .register(email, password)
          .then((privatePassKey) => onKeyDecrypted(privatePassKey));
      }}
    />
  );
}
