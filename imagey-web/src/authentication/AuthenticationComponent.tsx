import { useEffect, useState } from "react";
import { deviceRepository } from "../device/DeviceRepository";
import EmailDialog from "./EmailDialog";
import { AuthenticationStatus } from "./AuthenticationStatus";
import { authenticationRepository } from "./AuthenticationRepository";
import { ResponseError } from "./ResponseError";
import RegistrationDialog from "./RegistrationDialog";
import AuthenticationDialog from "./AuthenticationDialog";
import DeviceSetupDialog from "./DeviceSetupDialog";
import DeviceRegistrationDialog from "./DeviceRegistrationDialog";

interface AuthenticationComponentProperties {
  onKeyDecrypted: (key: JsonWebKey) => void;
}

export default function AuthenticationComponent({
  onKeyDecrypted,
}: AuthenticationComponentProperties) {
  const [authenticationStatus, setAuthenticationStatus] = useState(
    AuthenticationStatus.IN_PROGRESS,
  );
  const params = new URLSearchParams(window.location.search);
  const [email, setEmail] = useState(
    params.get("email") ?? deviceRepository.loadUser(),
  );
  const [deviceId, setDeviceId] = useState<string>();
  useEffect(() => {
    if (email) {
      console.log("E-Mail: " + email);
      authenticationRepository
        .loadPublicKey(email)
        .then(() => {
          console.log("public key loaded");
          setAuthenticationStatus(AuthenticationStatus.AUTHENTICATED);
          setDeviceId(deviceRepository.loadDeviceId(email));
        })
        .catch((error) => {
          console.log("Error " + error);
          switch (error) {
            case ResponseError.NOT_FOUND: {
              setAuthenticationStatus(AuthenticationStatus.NOT_REGISTERED);
              break;
            }
            case ResponseError.UNAUTHORIZED: {
              setAuthenticationStatus(AuthenticationStatus.UNAUTHENTICATED);
              break;
            }
            default: {
              setAuthenticationStatus(AuthenticationStatus.UNKNOWN_ERROR);
            }
          }
        });
    }
  }, [email]);

  if (!email) {
    console.log("No Email");
    return <EmailDialog onEmailSelected={(email) => setEmail(email)} />;
  }
  switch (authenticationStatus) {
    case AuthenticationStatus.UNAUTHENTICATED:
      console.log("unauthenticated");
      return <AuthenticationDialog email={email} />;
    case AuthenticationStatus.NOT_REGISTERED:
      console.log("not registered");
      return (
        <RegistrationDialog email={email} onKeyDecrypted={onKeyDecrypted} />
      );
    case AuthenticationStatus.AUTHENTICATED:
      if (deviceId) {
        console.log("Authenticated with device");
        return (
          <DeviceSetupDialog
            email={email}
            deviceId={deviceId}
            onKeyDecrypted={onKeyDecrypted}
          />
        );
      } else {
        console.log("authenticated, but no device");
        return (
          <DeviceRegistrationDialog
            email={email}
            onKeyDecrypted={onKeyDecrypted}
          />
        );
      }
    default:
      console.log("authenticationStatus = " + authenticationStatus);
      return <>{"Uknown Authentication Error"}</>;
  }
}
