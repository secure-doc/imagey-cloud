// What a device tells about itself, so the user can tell their devices apart.
// Only ever stored encrypted (ADR 0017): see deviceService.encryptDeviceInfo.
export type DeviceType = "phone" | "tablet" | "desktop";

export interface DeviceInfo {
  browser: string;
  os: string;
  type: DeviceType;
  // Set by the user when renaming a device; the list falls back to
  // "<browser> on <os>" without it.
  name?: string;
  createdAt: string;
}

// The longest name a device can be given. Even if every character took the
// six bytes of a JSON \u escape, the info stays below 512 bytes, i.e. two
// padding blocks - far below the server's limit of 4096 base64 characters.
export const MAX_DEVICE_NAME_LENGTH = 64;

// A device as listed by the server: `info` is still the encrypted blob. The
// public key comes along because it is needed to decrypt the info.
export interface EncryptedDevice {
  deviceId: string;
  activated: boolean;
  publicKey?: JsonWebKey;
  info?: string;
}

export interface Device {
  deviceId: string;
  activated: boolean;
  publicKey?: JsonWebKey;
  // Missing for devices registered before devices described themselves, and
  // for infos that cannot be decrypted.
  info?: DeviceInfo;
}

// First match wins, so the more specific tokens come first (Edge and Opera
// also carry "Chrome/", Chrome also carries "Safari/"); the last row catches
// everything else.
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
  [/.*/, "Browser"],
];

const OPERATING_SYSTEMS: [RegExp, string, DeviceType][] = [
  [/iPad/, "iPadOS", "tablet"],
  [/iPhone|iPod/, "iOS", "phone"],
  [/Android.*Mobile/, "Android", "phone"],
  [/Android/, "Android", "tablet"],
  [/CrOS/, "ChromeOS", "desktop"],
  [/Windows/, "Windows", "desktop"],
  [/Mac OS X|Macintosh/, "macOS", "desktop"],
  [/Linux/, "Linux", "desktop"],
  [/.*/, "Unknown OS", "desktop"],
];

export function describeDevice(
  userAgent: string,
  maxTouchPoints: number,
  now: Date,
): DeviceInfo {
  const [, browser] = BROWSERS.find(([pattern]) => pattern.test(userAgent))!;
  const [, os, type] = OPERATING_SYSTEMS.find(([pattern]) =>
    pattern.test(userAgent),
  )!;
  // iPadOS 13+ claims to be a Mac; only the touch screen gives it away.
  const isIPad = os === "macOS" && maxTouchPoints > 1;
  return {
    browser,
    os: isIPad ? "iPadOS" : os,
    type: isIPad ? "tablet" : type,
    createdAt: now.toISOString(),
  };
}

export function describeThisDevice(): DeviceInfo {
  return describeDevice(
    navigator.userAgent,
    navigator.maxTouchPoints,
    new Date(),
  );
}
