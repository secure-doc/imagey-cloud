import { useEffect, useState } from "react";
import { authenticationRepository } from "../authentication/AuthenticationRepository";
import { deviceRepository } from "./DeviceRepository";
import { useTranslation } from "react-i18next";
import DeviceActivationDialog from "./DeviceActivationDialog";
import { useCurrentUser } from "../contexts/AuthenticationContext";

export default function DeviceList() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const [devices, setDevices] = useState<string[]>([]);
  const [deviceIdToActivate, setDeviceIdToActivate] = useState<
    string | undefined
  >();
  const [error, setError] = useState<string>();
  const thisDeviceId = deviceRepository.loadDeviceId(user);
  useEffect(() => {
    authenticationRepository
      .findDevices(user)
      .then((devices) => setDevices(devices));
  }, [user]);
  return (
    <section className="col scroll s12 m6 l6">
      {deviceIdToActivate && (
        <DeviceActivationDialog
          deviceId={deviceIdToActivate}
          onActivation={() => setDeviceIdToActivate(undefined)}
          onError={() => {
            setDeviceIdToActivate(undefined);
            setError(t("Error activating device"));
          }}
        />
      )}
      {error && <div className="error">{error}</div>}
      <ul className="list border">
        {devices.map((deviceId) => (
          <li key={deviceId}>
            <i>devices</i>
            <div
              className="max"
              onClick={() => {
                setError(undefined);
                setDeviceIdToActivate(deviceId);
              }}
            >
              <h6 className="small">
                {thisDeviceId === deviceId ? t("This device") : deviceId}
              </h6>
              <div>{deviceId}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
