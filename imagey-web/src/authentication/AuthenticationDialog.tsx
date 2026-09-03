import { useEffect, useRef, useState } from "react";
import {
  authenticationService,
  RegistrationResult,
} from "./AuthenticationService";
import { useTranslation } from "react-i18next";

interface AuthenticationDialogProperties {
  email: string;
}

export default function AuthenticationDialog({
  email,
}: AuthenticationDialogProperties) {
  const { t } = useTranslation();
  const [registrationResult, setRegistrationResult] =
    useState<RegistrationResult>();
  // Fire the request exactly once per email address. Without this guard the
  // effect re-ran on every render (it has no dependency array, and its own
  // setRegistrationResult triggers a re-render), so registration/login mails
  // were sent twice.
  const requestedEmail = useRef<string>();
  useEffect(() => {
    if (requestedEmail.current === email) {
      return;
    }
    requestedEmail.current = email;
    authenticationService
      .startAuthentication(email)
      .then((registrationResult) => setRegistrationResult(registrationResult));
  }, [email]);
  switch (registrationResult) {
    case RegistrationResult.RegistrationStarted:
      return (
        <dialog className="surface-bright" open>
          {t("Registration Mail with verification link was sent")}
        </dialog>
      );

    case RegistrationResult.AuthenticationStarted:
      return (
        <dialog className="surface-bright" open>
          {t("Mail with login link was sent")}
        </dialog>
      );

    case RegistrationResult.ServiceUnavailable:
      return (
        <dialog className="surface-bright" open>
          {t("Mail server is currently unavailable")}
        </dialog>
      );

    case RegistrationResult.Error:
      return (
        <dialog className="surface-bright" open>
          {t("An error occurred during authentication")}
        </dialog>
      );

    default:
      return (
        <dialog className="surface-bright" open>
          {t("Authentication in progress")}
        </dialog>
      );
  }
}
