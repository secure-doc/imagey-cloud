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
import { UserId } from "./UserId";

import { authenticationService } from "./AuthenticationService";

interface AuthenticationComponentProperties {
  onKeysDecrypted: (
    user: UserId,
    email: Email | undefined,
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
  // The account is identified by its server id (UUID). We learn it from the
  // `?userId=` redirect the server appends to every sign-in / registration link,
  // or from a previous session in local storage. The email is display-only.
  const [userId, setUserId] = useState<UserId | undefined>(
    params.get("userId") ?? deviceRepository.loadUser(),
  );
  const [email, setEmail] = useState<Email | undefined>(
    params.get("email") ?? deviceRepository.loadEmail(),
  );
  const [deviceId, setDeviceId] = useState<string>();
  const [publicMainKey, setPublicMainKey] = useState<JsonWebKey>();
  useEffect(() => {
    if (!userId) {
      return;
    }
    authenticationRepository
      .loadPublicMainKey(userId)
      .then(async (publicMainKey) => {
        setPublicMainKey(publicMainKey);
        deviceRepository.storeUser(userId);
        if (email) {
          deviceRepository.storeEmail(email);
        }
        const currentDeviceId = deviceRepository.loadDeviceId(userId);
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

              onKeysDecrypted(userId, email, {
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
            setDeviceId(deviceRepository.loadDeviceId(userId));
            break;
          }
          default: {
            setAuthenticationStatus(AuthenticationStatus.UNKNOWN_ERROR);
          }
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleWrongUser = () => {
    deviceRepository.removeUser();
    setUserId(undefined);
    setEmail(undefined);
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
      onKeysDecrypted(userId!, email, {
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

  // Without a userId the client cannot resolve the account itself - the only way
  // forward is the emailed sign-in / registration link. Ask for the address (if
  // we don't have one) and trigger that mail.
  if (!userId) {
    if (!email) {
      return <EmailDialog onEmailSelected={(email) => setEmail(email)} />;
    }
    return <AuthenticationDialog email={email} />;
  }

  switch (authenticationStatus) {
    case AuthenticationStatus.UNAUTHENTICATED:
      return deviceId ? (
        <ChallengeAuthenticationDialog
          userId={userId}
          email={email}
          deviceId={deviceId}
          onAuthenticated={handleAuthenticated}
          onWrongUser={handleWrongUser}
        />
      ) : email ? (
        <AuthenticationDialog email={email} />
      ) : (
        <EmailDialog onEmailSelected={(email) => setEmail(email)} />
      );
    case AuthenticationStatus.NOT_REGISTERED:
      // Registration persists the address (server keeps only its HMAC), so never start it without
      // one - ask for the address first if this device has a userId but no known email.
      return email ? (
        <RegistrationDialog
          userId={userId}
          email={email}
          onKeysDecrypted={(keyPairs) =>
            onKeysDecrypted(userId, email, keyPairs)
          }
        />
      ) : (
        <EmailDialog onEmailSelected={(email) => setEmail(email)} />
      );
    case AuthenticationStatus.AUTHENTICATED:
      if (deviceId && publicMainKey) {
        return (
          <DeviceSetupDialog
            userId={userId}
            email={email}
            deviceId={deviceId}
            onWrongUser={handleWrongUser}
            onPrivateKeysDecrypted={(privateMainKey, privateDeviceKey) =>
              authenticationRepository
                .loadPublicDeviceKey(userId, deviceId)
                .then((publicDeviceKey) =>
                  onKeysDecrypted(userId, email, {
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
            userId={userId}
            email={email}
            onWrongUser={handleWrongUser}
            onKeysDecrypted={(privateMainKey, deviceKeyPair) =>
              onKeysDecrypted(userId, email, {
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
