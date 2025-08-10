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
import { useTranslation } from "react-i18next";

interface AuthenticationComponentProperties {
  onKeyDecrypted: (
    user: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ) => void;
}

export default function AuthenticationComponent({
  onKeyDecrypted,
}: AuthenticationComponentProperties) {
  const { t } = useTranslation();
  const [authenticationStatus, setAuthenticationStatus] = useState(
    AuthenticationStatus.IN_PROGRESS,
  );
  const params = new URLSearchParams(window.location.search);
  const [email, setEmail] = useState(
    params.get("email") ?? deviceRepository.loadUser(),
  );
  const [deviceId, setDeviceId] = useState<string>();
  const [publicKey, setPublicKey] = useState<JsonWebKey>();
  useEffect(() => {
    if (email) {
      authenticationRepository
        .loadPublicKey(email)
        .then((publicKey) => {
          setPublicKey(publicKey);
          setAuthenticationStatus(AuthenticationStatus.AUTHENTICATED);
          setDeviceId(deviceRepository.loadDeviceId(email));
        })
        .catch((error) => {
          switch (error) {
            case ResponseError.NOT_FOUND: {
              setAuthenticationStatus(AuthenticationStatus.NOT_REGISTERED);
              break;
            }
            case ResponseError.UNAUTHORIZED:
            case ResponseError.FORBIDDEN: {
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
    return <EmailDialog onEmailSelected={(email) => setEmail(email)} />;
  }
  switch (authenticationStatus) {
    case AuthenticationStatus.UNAUTHENTICATED:
      return <AuthenticationDialog email={email} />;
    case AuthenticationStatus.NOT_REGISTERED:
      return (
        <RegistrationDialog
          email={email}
          onKeyDecrypted={(publicKey, privateKey) =>
            onKeyDecrypted(email, publicKey, privateKey)
          }
        />
      );
    case AuthenticationStatus.AUTHENTICATED:
      if (deviceId && publicKey) {
        return (
          <DeviceSetupDialog
            email={email}
            deviceId={deviceId}
            onKeyDecrypted={(key) => onKeyDecrypted(email, publicKey, key)}
          />
        );
      } else if (publicKey) {
        return (
          <DeviceRegistrationDialog
            email={email}
            onKeyDecrypted={(key) => onKeyDecrypted(email, publicKey, key)}
          />
        );
      } else {
        return (
          <dialog className="surface-bright" open>
            {t("Loading public key")}
          </dialog>
        );
      }
    default:
      return (
        <dialog className="surface-bright" open>
          {t("Uknown Authentication Error")}
        </dialog>
      );
  }
}
