import { useEffect, useState } from "react";
import { authenticationRepository } from "../authentication/AuthenticationRepository";

export default function DeviceList({ user }: { user: string }) {
  const [devices, setDevices] = useState<string[]>([]);
  useEffect(() => {
    authenticationRepository
      .findDevices(user)
      .then((devices) => setDevices(devices));
  }, [user]);
  return (
    <section className="col scroll s12 m6 l6">
      <ul className="list border">
        {devices.map((deviceId) => (
          <li>
            <i>devices</i>
            <div className="max">
              <h6 className="small">{deviceId}</h6>
              <div>{deviceId}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
