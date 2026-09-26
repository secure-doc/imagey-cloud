import { TFunction } from "i18next";
import { Device, DeviceInfo, DeviceType } from "./DeviceInfo";

const ICONS: Record<DeviceType, string> = {
  phone: "smartphone",
  tablet: "tablet",
  desktop: "computer",
};

export function deviceIcon(device: Device) {
  return device.info ? ICONS[device.info.type] : "devices";
}

export function devicePlatform(t: TFunction, info: DeviceInfo) {
  return t("{{browser}} on {{os}}", { browser: info.browser, os: info.os });
}

// The user's own name for the device, else what it is, else - for devices
// registered before devices described themselves - its id.
export function deviceTitle(t: TFunction, device: Device) {
  return device.info
    ? device.info.name || devicePlatform(t, device.info)
    : device.deviceId;
}

export function deviceRegistrationDate(
  t: TFunction,
  info: DeviceInfo,
  language: string,
) {
  return t("Registered on {{date}}", {
    date: new Date(info.createdAt).toLocaleDateString(language),
  });
}
