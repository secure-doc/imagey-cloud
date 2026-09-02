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
  // Only asked for an invite-based registration (§3.6): a regular
  // registration has no contact yet to show a name to, so the field is
  // simply omitted rather than shown unused.
  const [displayName, setDisplayName] = useState("");
  return (
    <>
      <PasswordDialog<string>
        message={t("Select a password for this device")}
        requireConfirmation
        validatePassword={(password) => Promise.resolve(password)}
        onPasswordValid={(password) => {
          authenticationService
            .register(
              userId,
              email,
              password,
              inviter,
              // Trim so a whitespace-only value (which the browser's `required`
              // still treats as filled) collapses to "" - register() then takes
              // its no-name path instead of persisting a blank display name.
              inviter ? displayName.trim() : undefined,
            )
            .then((keyPairs) => onKeysDecrypted(keyPairs))
            .catch(() => setRegistrationError(true));
        }}
      >
        {inviter && (
          <div className="field label border">
            <input
              id="displayName"
              name="displayName"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <label htmlFor="displayName">
              {t("How should others see you?")}
            </label>
          </div>
        )}
      </PasswordDialog>
      {registrationError && (
        <dialog className="surface-bright" open>
          {t("An error occurred during authentication")}
        </dialog>
      )}
    </>
  );
}
