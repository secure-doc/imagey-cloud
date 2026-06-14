import PasswordDialog from "./PasswordDialog";
import { authenticationService } from "./AuthenticationService";
import { useTranslation } from "react-i18next";

interface ChallengeAuthenticationDialogProperties {
  email: string;
  deviceId: string;
  onAuthenticated: () => void;
  onWrongUser: () => void;
}

export default function ChallengeAuthenticationDialog({
  email,
  deviceId,
  onAuthenticated,
  onWrongUser,
}: ChallengeAuthenticationDialogProperties) {
  const { t } = useTranslation();
  return (
    <PasswordDialog<void>
      message={t("Login via Device Key")}
      email={email}
      onWrongUser={onWrongUser}
      validatePassword={(password) =>
        authenticationService.authenticateWithChallenge(
          email,
          deviceId,
          password,
        )
      }
      onPasswordValid={() => onAuthenticated()}
    />
  );
}
