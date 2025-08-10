import { useEffect, useState } from "react";
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
  useEffect(() => {
    authenticationService
      .startAuthentication(email)
      .then((registrationResult) => setRegistrationResult(registrationResult));
  });
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

    default:
      return (
        <dialog className="surface-bright" open>
          {t("Authentication in progress")}
        </dialog>
      );
  }
}
