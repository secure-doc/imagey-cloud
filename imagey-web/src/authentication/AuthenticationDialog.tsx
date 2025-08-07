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
    case RegistrationResult.RegistrationStarted: {
      return <>{t("Registration Mail with verification link was sent")}</>;
    }
    case RegistrationResult.AuthenticationStarted: {
      return <>{t("Mail with login link was sent")}</>;
    }
    default:
      return <>{t("Authentication in progress")}</>;
  }
}
