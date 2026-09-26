import { useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceService } from "./DeviceService";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { Device } from "./DeviceInfo";
import {
  devicePlatform,
  deviceRegistrationDate,
  deviceTitle,
} from "./deviceLabels";

export default function DeviceActivationDialog({
  device,
  onActivation,
  onCancel,
  onError,
}: {
  device: Device;
  onActivation: () => void;
  onCancel: () => void;
  onError: (e: unknown) => void;
}) {
  const { t, i18n } = useTranslation();
  const authentication = useAuthentication();
  const keyPairs = authentication.keyPairs;
  const decryptedPrivateMainKey = keyPairs.mainKeyPair.privateKey;
  const privateDeviceKeyOfThisDevice = keyPairs.deviceKeyPair.privateKey;
  const [loading, setLoading] = useState(false);

  return (
    <dialog className="surface-bright" open>
      <h5>{t("Activate device?")}</h5>
      <p>
        {t("Do you want to activate the device {{device}}?", {
          device: deviceTitle(t, device),
        })}
      </p>
      {device.info && (
        <p>
          {devicePlatform(t, device.info)}
          <br />
          {deviceRegistrationDate(t, device.info, i18n.language)}
        </p>
      )}
      <p className="small-text">ID: {device.deviceId}</p>
      <nav className="right-align no-space">
        <button
          className="transparent link"
          disabled={loading}
          onClick={onCancel}
        >
          {t("Cancel")}
        </button>
        <button
          className="transparent link"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            deviceService
              .activateDevice(
                authentication.user,
                device.deviceId,
                decryptedPrivateMainKey,
                privateDeviceKeyOfThisDevice,
              )
              .then(() => onActivation())
              .catch((e) => {
                setLoading(false);
                onError(e);
              });
          }}
        >
          {t("Confirm")}
        </button>
      </nav>
    </dialog>
  );
}
