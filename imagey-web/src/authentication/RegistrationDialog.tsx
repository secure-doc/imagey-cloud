import PasswordDialog from "./PasswordDialog";
import { authenticationService } from "./AuthenticationService";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { JsonWebKeyPairs } from "../contexts/AuthenticationContext";
import { UserId } from "./UserId";

interface RegistrationDialogProperties {
  userId: UserId;
  // Required: the address is written into the (encrypted) profile document at registration and the
  // server keeps only its irreversible HMAC, so registering without it would lose the address for
  // good. The caller falls back to EmailDialog when it is not known.
  email: string;
  onKeysDecrypted: (keyPairs: JsonWebKeyPairs) => void;
}

export default function RegistrationDialog({
  userId,
  email,
  onKeysDecrypted,
}: RegistrationDialogProperties) {
  const { t } = useTranslation();
  const params = new URLSearchParams(window.location.search);
  const inviter = params.get("inviter") ?? undefined;
  const [registrationError, setRegistrationError] = useState(false);
  return (
    <>
      <PasswordDialog<string>
        message={t("Select a password for this device")}
        requireConfirmation
        validatePassword={(password) => Promise.resolve(password)}
        onPasswordValid={(password) => {
          authenticationService
            .register(userId, email, password, inviter)
            .then((keyPairs) => onKeysDecrypted(keyPairs))
            .catch(() => setRegistrationError(true));
        }}
      />
      {registrationError && (
        <dialog className="surface-bright" open>
          {t("An error occurred during authentication")}
        </dialog>
      )}
    </>
  );
}
