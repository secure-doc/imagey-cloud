import { useEffect, useState } from "react";
import {
  authenticationService,
  RegistrationResult,
} from "./AuthenticationService";

interface AuthenticationDialogProperties {
  email: string;
}

export default function AuthenticationDialog({
  email,
}: AuthenticationDialogProperties) {
  const [registrationResult, setRegistrationResult] =
    useState<RegistrationResult>();
  useEffect(() => {
    authenticationService
      .startAuthentication(email)
      .then((registrationResult) => setRegistrationResult(registrationResult));
  });
  switch (registrationResult) {
    case RegistrationResult.RegistrationStarted: {
      return <>{"Registration Mail with verification link was sent"}</>;
    }
    case RegistrationResult.AuthenticationStarted: {
      return <>{"Mail with login link was sent"}</>;
    }
    default:
      return <>{"Authentication in progress"}</>;
  }
}
