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
import { Email, JsonWebKeyPairs } from "../contexts/AuthenticationContext";

interface AuthenticationComponentProperties {
  onKeysDecrypted: (user: Email, keyPairs: JsonWebKeyPairs) => void;
}

export default function AuthenticationComponent({
  onKeysDecrypted,
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
  const [publicMainKey, setPublicMainKey] = useState<JsonWebKey>();
  useEffect(() => {
    if (email) {
      authenticationRepository
        .loadPublicMainKey(email)
        .then((publicMainKey) => {
          setPublicMainKey(publicMainKey);
          setAuthenticationStatus(AuthenticationStatus.AUTHENTICATED);
          deviceRepository.storeUser(email);
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
          onKeysDecrypted={(keyPairs) => onKeysDecrypted(email, keyPairs)}
        />
      );
    case AuthenticationStatus.AUTHENTICATED:
      if (deviceId && publicMainKey) {
        return (
          <DeviceSetupDialog
            email={email}
            deviceId={deviceId}
            onPrivateKeysDecrypted={(privateMainKey, privateDeviceKey) => {
              authenticationRepository
                .loadPublicDeviceKey(email, deviceId)
                .then((publicDeviceKey) =>
                  onKeysDecrypted(email, {
                    mainKeyPair: {
                      publicKey: publicMainKey,
                      privateKey: privateMainKey,
                    },
                    deviceKeyPair: {
                      publicKey: publicDeviceKey,
                      privateKey: privateDeviceKey,
                    },
                  }),
                );
            }}
          />
        );
      } else if (publicMainKey) {
        return (
          <DeviceRegistrationDialog
            email={email}
            onKeysDecrypted={(privateMainKey, deviceKeyPair) =>
              onKeysDecrypted(email, {
                mainKeyPair: {
                  publicKey: publicMainKey,
                  privateKey: privateMainKey,
                },
                deviceKeyPair,
              })
            }
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
