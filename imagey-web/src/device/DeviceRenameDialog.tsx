import { useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceService } from "./DeviceService";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { DeviceInfo, MAX_DEVICE_NAME_LENGTH } from "./DeviceInfo";
import { devicePlatform } from "./deviceLabels";

export default function DeviceRenameDialog({
  deviceId,
  publicKey,
  info,
  onRenamed,
  onCancel,
  onError,
}: {
  deviceId: string;
  publicKey: JsonWebKey;
  info: DeviceInfo;
  onRenamed: () => void;
  onCancel: () => void;
  onError: (e: unknown) => void;
}) {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const [name, setName] = useState(info.name ?? "");
  const [saving, setSaving] = useState(false);

  const save = () => {
    setSaving(true);
    deviceService
      .renameDevice(
        authentication.user,
        deviceId,
        publicKey,
        info,
        name.trim(),
        authentication.keyPairs.mainKeyPair.privateKey,
      )
      .then(() => onRenamed())
      .catch((e) => {
        setSaving(false);
        onError(e);
      });
  };

  return (
    <>
      <div className="overlay active" onClick={onCancel}></div>
      <dialog className="surface-bright active" open>
        <h5>{t("Rename device")}</h5>
        <div className="field label border">
          <input
            id="device-name"
            type="text"
            value={name}
            maxLength={MAX_DEVICE_NAME_LENGTH}
            placeholder=" "
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            autoFocus
          />
          <label htmlFor="device-name">{t("Device name")}</label>
          <span className="helper">{devicePlatform(t, info)}</span>
        </div>
        <nav className="right-align no-space">
          <button
            className="transparent link"
            onClick={onCancel}
            disabled={saving}
          >
            {t("Cancel")}
          </button>
          <button className="transparent link" onClick={save} disabled={saving}>
            {t("Save")}
          </button>
        </nav>
      </dialog>
    </>
  );
}
