import PasswordDialog from "./PasswordDialog";
import { authenticationService } from "./AuthenticationService";
import { useTranslation } from "react-i18next";
import { UserId } from "./UserId";

interface ChallengeAuthenticationDialogProperties {
  userId: UserId;
  email?: string;
  deviceId: string;
  onAuthenticated: (
    privateMainKey: JsonWebKey,
    privateDeviceKey: JsonWebKey,
  ) => void;
  onWrongUser: () => void;
}

export default function ChallengeAuthenticationDialog({
  userId,
  email,
  deviceId,
  onAuthenticated,
  onWrongUser,
}: ChallengeAuthenticationDialogProperties) {
  const { t } = useTranslation();
  return (
    <PasswordDialog<{
      privateMainKey: JsonWebKey;
      privateDeviceKey: JsonWebKey;
    }>
      message={t("Login via Device Key")}
      email={email}
      showKeepLoggedIn={true}
      onWrongUser={onWrongUser}
      validatePassword={(password, keepLoggedIn) =>
        authenticationService.authenticateWithChallenge(
          userId,
          deviceId,
          password,
          keepLoggedIn,
        )
      }
      onPasswordValid={({ privateMainKey, privateDeviceKey }) =>
        onAuthenticated(privateMainKey, privateDeviceKey)
      }
    />
  );
}
