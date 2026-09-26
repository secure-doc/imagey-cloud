import { useCallback, useEffect, useState } from "react";
import { deviceRepository } from "./DeviceRepository";
import { deviceService } from "./DeviceService";
import { useTranslation } from "react-i18next";
import DeviceActivationDialog from "./DeviceActivationDialog";
import DeviceRenameDialog from "./DeviceRenameDialog";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { Device } from "./DeviceInfo";
import {
  deviceIcon,
  devicePlatform,
  deviceRegistrationDate,
  deviceTitle,
} from "./deviceLabels";

export default function DeviceList() {
  const { t, i18n } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const privateMainKey = authentication.keyPairs.mainKeyPair.privateKey;
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceToActivate, setDeviceToActivate] = useState<Device>();
  const [deviceToRename, setDeviceToRename] = useState<Device>();
  const [error, setError] = useState<string>();
  const thisDeviceId = deviceRepository.loadDeviceId(user);
  const loadDevices = useCallback(
    () =>
      deviceService.loadDevices(user, privateMainKey).then((devices) =>
        setDevices(
          // This device first, the others in the order the server lists them.
          [...devices].sort(
            (a, b) =>
              Number(b.deviceId === thisDeviceId) -
              Number(a.deviceId === thisDeviceId),
          ),
        ),
      ),
    [user, privateMainKey, thisDeviceId],
  );
  useEffect(() => {
    loadDevices();
  }, [loadDevices]);
  return (
    <section className="col scroll s12 m6 l6">
      {deviceToActivate && (
        <DeviceActivationDialog
          device={deviceToActivate}
          onActivation={() => {
            setDeviceToActivate(undefined);
            loadDevices();
          }}
          onCancel={() => setDeviceToActivate(undefined)}
          onError={() => {
            setDeviceToActivate(undefined);
            setError(t("Error activating device"));
          }}
        />
      )}
      {deviceToRename?.info && (
        <DeviceRenameDialog
          deviceId={deviceToRename.deviceId}
          // An info could only be decrypted with the device's public key.
          publicKey={deviceToRename.publicKey!}
          info={deviceToRename.info}
          onRenamed={() => {
            setDeviceToRename(undefined);
            loadDevices();
          }}
          onCancel={() => setDeviceToRename(undefined)}
          onError={() => {
            setDeviceToRename(undefined);
            setError(t("Error renaming device"));
          }}
        />
      )}
      {error && <div className="error">{error}</div>}
      <ul className="list border">
        {devices.map((device) => (
          <li key={device.deviceId}>
            <i>{deviceIcon(device)}</i>
            <div
              className="max"
              onClick={() => {
                if (!device.activated) {
                  setError(undefined);
                  setDeviceToActivate(device);
                }
              }}
            >
              <h6 className="small">{deviceTitle(t, device)}</h6>
              <div>
                {[
                  device.info?.name && devicePlatform(t, device.info),
                  device.info &&
                    deviceRegistrationDate(t, device.info, i18n.language),
                  thisDeviceId === device.deviceId && t("This device"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              {!device.activated && (
                <span className="chip small">
                  {t("Waiting for activation")}
                </span>
              )}
            </div>
            {device.info && (
              <button
                className="transparent circle"
                aria-label={t("Rename device")}
                onClick={() => {
                  setError(undefined);
                  setDeviceToRename(device);
                }}
              >
                <i>edit</i>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
