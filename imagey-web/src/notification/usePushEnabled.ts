import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useUser } from "../contexts/AuthenticationContext";
import { deviceRepository } from "../device/DeviceRepository";
import { pushSubscriptionService } from "./PushSubscriptionService";

// One answer per device for all the bells of a chat list, not one lookup per row. A small store, so
// that bells already on screen follow a change (resetPushEnabled) and a failed lookup is not
// remembered: the next bell to appear asks again.
const answers = new Map<string, boolean>();
// The newest lookup per device; the answer of an older one is stale and dropped. It also
// covers a lookup that never ends (no service worker): a change asks again regardless.
const latest = new Map<string, number>();
let lookups = 0;
const known = new Set<string>();
const listeners = new Set<() => void>();

function ask(deviceId: string, changed = false): void {
  if (latest.has(deviceId) && !changed) {
    return; // one is under way already
  }
  const lookup = ++lookups;
  latest.set(deviceId, lookup);
  pushSubscriptionService
    .isEnabled(deviceId)
    .then((enabled) => {
      if (latest.get(deviceId) === lookup) {
        answers.set(deviceId, enabled);
        listeners.forEach((listener) => listener());
      }
    })
    .catch((e) => console.warn("Failed to look up the push state", e))
    .finally(() => {
      // Not remembered as under way any more: after a failure the next bell asks again.
      if (latest.get(deviceId) === lookup) {
        latest.delete(deviceId);
      }
    });
}

// Ask again after push was switched on or off (NotificationSettings).
export function resetPushEnabled(): void {
  known.forEach((deviceId) => ask(deviceId, true));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Whether push is active on this device (the same test as in the settings).
export function usePushEnabled(): boolean {
  const user = useUser();
  const deviceId = useMemo(() => deviceRepository.loadDeviceId(user), [user]);
  useEffect(() => {
    if (!deviceId) {
      return;
    }
    known.add(deviceId);
    if (!answers.has(deviceId)) {
      ask(deviceId);
    }
  }, [deviceId]);
  return useSyncExternalStore(subscribe, () =>
    deviceId ? (answers.get(deviceId) ?? false) : false,
  );
}
