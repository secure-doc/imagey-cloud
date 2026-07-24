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
import ChallengeAuthenticationDialog from "./ChallengeAuthenticationDialog";
import { useTranslation } from "react-i18next";
import { Email, JsonWebKeyPairs } from "../contexts/AuthenticationContext";

import { authenticationService } from "./AuthenticationService";

interface AuthenticationComponentProperties {
  onKeysDecrypted: (
    email: Email,
    userId: string,
    keyPairs: JsonWebKeyPairs,
  ) => void;
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
  const [userId, setUserId] = useState<string | undefined>(
    params.get("userId") ?? deviceRepository.loadUserId(),
  );
  const [deviceId, setDeviceId] = useState<string>();
  const [publicMainKey, setPublicMainKey] = useState<JsonWebKey>();
  useEffect(() => {
    if (email && userId) {
      authenticationRepository
        .loadPublicMainKey(userId)
        .then(async (publicMainKey) => {
          setPublicMainKey(publicMainKey);
          deviceRepository.storeUser(email);
          deviceRepository.storeUserId(userId);
          const currentDeviceId = deviceRepository.loadDeviceId(email);
          setDeviceId(currentDeviceId);

          if (currentDeviceId) {
            const encryptedRecoveryDeviceKey =
              deviceRepository.loadRecoveryKey(currentDeviceId);
            if (encryptedRecoveryDeviceKey) {
              try {
                const keys = await authenticationService.autoLogin(
                  userId,
                  currentDeviceId,
                  encryptedRecoveryDeviceKey,
                );

                onKeysDecrypted(email, userId, {
                  mainKeyPair: {
                    publicKey: publicMainKey,
                    privateKey: keys.privateMainKey,
                  },
                  deviceKeyPair: {
                    publicKey: keys.publicDeviceKey,
                    privateKey: keys.privateDeviceKey,
                  },
                });
                return;
              } catch (e) {
                console.warn("Auto-login failed", e);
              }
            }
          }

          setAuthenticationStatus(AuthenticationStatus.AUTHENTICATED);
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
              setDeviceId(deviceRepository.loadDeviceId(email));
              break;
            }
            default: {
              setAuthenticationStatus(AuthenticationStatus.UNKNOWN_ERROR);
            }
          }
        });
    } else if (email && !userId) {
      setAuthenticationStatus(AuthenticationStatus.UNAUTHENTICATED);
      setDeviceId(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, userId]);

  const handleWrongUser = () => {
    deviceRepository.removeUser();
    deviceRepository.removeUserId();
    setEmail(undefined);
    setUserId(undefined);
  };

  const handleAuthenticated = async (
    privateMainKey: JsonWebKey,
    privateDeviceKey: JsonWebKey,
  ) => {
    try {
      const publicMainKey = await authenticationRepository.loadPublicMainKey(
        userId!,
      );
      const publicDeviceKey =
        await authenticationRepository.loadPublicDeviceKey(userId!, deviceId!);
      onKeysDecrypted(email!, userId!, {
        mainKeyPair: {
          publicKey: publicMainKey,
          privateKey: privateMainKey,
        },
        deviceKeyPair: {
          publicKey: publicDeviceKey,
          privateKey: privateDeviceKey,
        },
      });
    } catch {
      window.location.reload();
    }
  };

  if (!email) {
    return <EmailDialog onEmailSelected={(email) => setEmail(email)} />;
  }
  switch (authenticationStatus) {
    case AuthenticationStatus.UNAUTHENTICATED:
      return deviceId ? (
        <ChallengeAuthenticationDialog
          email={email}
          deviceId={deviceId}
          onAuthenticated={handleAuthenticated}
          onWrongUser={handleWrongUser}
        />
      ) : (
        <AuthenticationDialog email={email} />
      );
    case AuthenticationStatus.NOT_REGISTERED:
      return (
        <RegistrationDialog
          email={email}
          onKeysDecrypted={(keyPairs) =>
            onKeysDecrypted(email, userId!, keyPairs)
          }
        />
      );
    case AuthenticationStatus.AUTHENTICATED:
      if (deviceId && publicMainKey) {
        return (
          <DeviceSetupDialog
            email={email}
            deviceId={deviceId}
            onWrongUser={handleWrongUser}
            onPrivateKeysDecrypted={(privateMainKey, privateDeviceKey) =>
              authenticationRepository
                .loadPublicDeviceKey(userId!, deviceId)
                .then((publicDeviceKey) =>
                  onKeysDecrypted(email, userId!, {
                    mainKeyPair: {
                      publicKey: publicMainKey,
                      privateKey: privateMainKey,
                    },
                    deviceKeyPair: {
                      publicKey: publicDeviceKey,
                      privateKey: privateDeviceKey,
                    },
                  }),
                )
            }
          />
        );
      } else if (publicMainKey) {
        return (
          <DeviceRegistrationDialog
            email={email}
            onWrongUser={handleWrongUser}
            onKeysDecrypted={(privateMainKey, deviceKeyPair) =>
              onKeysDecrypted(email, userId!, {
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
