import { SettingsList } from "./Settings";
import DeviceList from "../device/DeviceList";
import { useBackButton } from "../contexts/ActionBarContext";

export default function Devices() {
  useBackButton();
  return (
    <main className="grid no-margin">
      <SettingsList className="m l" />
      <DeviceList />
    </main>
  );
}
