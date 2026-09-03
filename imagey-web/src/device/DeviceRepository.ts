// imagey.user           - the signed-in account's server id (a UUID)
// imagey.email           - the address that id was last reached through (display only)
// imagey.keepLoggedIn    - the last "keep me logged in" choice, remembered across sign-ins
// imagey.deviceIds[userId]        - this browser's device id for that account
// imagey.devices[deviceId].key    - the password-encrypted private device key
export const deviceRepository = {
  loadUser: () => {
    const userId = localStorage.getItem("imagey.user");
    return userId ? userId : undefined;
  },
  storeUser: (userId: string) => {
    localStorage.setItem("imagey.user", userId);
  },
  removeUser: () => {
    localStorage.removeItem("imagey.user");
    localStorage.removeItem("imagey.email");
  },
  loadEmail: () => {
    const email = localStorage.getItem("imagey.email");
    return email ? email : undefined;
  },
  storeEmail: (email: string) => {
    localStorage.setItem("imagey.email", email);
  },
  loadKeepLoggedIn: (): boolean | undefined => {
    const value = localStorage.getItem("imagey.keepLoggedIn");
    return value === null ? undefined : value === "true";
  },
  storeKeepLoggedIn: (keepLoggedIn: boolean) => {
    localStorage.setItem("imagey.keepLoggedIn", String(keepLoggedIn));
  },
  loadDeviceId: (userId: string) => {
    const deviceId = localStorage.getItem(`imagey.deviceIds[${userId}]`);
    return deviceId ? deviceId : undefined;
  },
  storeDeviceId: (userId: string, deviceId: string) => {
    localStorage.setItem(`imagey.deviceIds[${userId}]`, deviceId);
  },
  loadKey: (deviceId: string) => {
    const key = localStorage.getItem(`imagey.devices[${deviceId}].key`);
    return key ? key : undefined;
  },
  storeKey: (deviceId: string, encryptedPrivateKey: string) => {
    localStorage.setItem(
      `imagey.devices[${deviceId}].key`,
      encryptedPrivateKey,
    );
  },
  loadRecoveryKey: (deviceId: string) => {
    const key = localStorage.getItem(
      `imagey.devices[${deviceId}].recovery-key`,
    );
    return key ? key : undefined;
  },
  storeRecoveryKey: (deviceId: string, encryptedRecoveryKey: string) => {
    localStorage.setItem(
      `imagey.devices[${deviceId}].recovery-key`,
      encryptedRecoveryKey,
    );
  },
};
