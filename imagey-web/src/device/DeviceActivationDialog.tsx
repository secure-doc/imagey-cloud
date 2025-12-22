import { useTranslation } from "react-i18next";
import { deviceService } from "./DeviceService";
import {
  useCurrentUser,
  usePrivateDeviceKey,
  usePrivateMainKey,
} from "../contexts/AuthenticationContext";

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
  const user = useCurrentUser();
  const decryptedPrivateMainKey = usePrivateMainKey();
  const privateDeviceKeyOfThisDevice = usePrivateDeviceKey();
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
                user,
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
