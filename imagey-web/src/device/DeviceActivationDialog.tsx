import { useTranslation } from "react-i18next";
import { deviceService } from "./DeviceService";
import { useAuthentication } from "../contexts/AuthenticationContext";

export default function DeviceActivationDialog({
  deviceId,
  onActivation,
  onError,
}: {
  deviceId: string;
  onActivation: () => void;
  onError: (e: unknown) => void;
}) {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const keyPairs = authentication.keyPairs;
  const decryptedPrivateMainKey = keyPairs.mainKeyPair.privateKey;
  const privateDeviceKeyOfThisDevice = keyPairs.deviceKeyPair.privateKey;
  return (
    <dialog className="surface-bright" open>
      {t("Do you want to activate the device with id {{deviceId}}?", {
        deviceId,
      })}
      <nav className="right-align no-space">
        <button
          className="transparent link"
          onClick={() =>
            deviceService
              .activateDevice(
                authentication.user,
                deviceId,
                decryptedPrivateMainKey,
                privateDeviceKeyOfThisDevice,
              )
              .then(() => onActivation())
              .catch((e) => {
                onError(e);
              })
          }
        >
          {t("Confirm")}
        </button>
      </nav>
    </dialog>
  );
}
