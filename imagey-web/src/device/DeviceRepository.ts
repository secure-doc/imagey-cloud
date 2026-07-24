// imagey.user contains the email address
// imagey.userId contains the user id
// imagey.deviceIds[email] contains the device id of the user
// imagey.devices[deviceId].key contains the encrypted private device key
export const deviceRepository = {
  loadUser: () => {
    const email = localStorage.getItem("imagey.user");
    return email ? email : undefined;
  },
  storeUser: (user: string) => {
    localStorage.setItem("imagey.user", user);
  },
  removeUser: () => {
    localStorage.removeItem("imagey.user");
  },
  loadUserId: () => {
    const userId = localStorage.getItem("imagey.userId");
    return userId ? userId : undefined;
  },
  storeUserId: (userId: string) => {
    localStorage.setItem("imagey.userId", userId);
  },
  removeUserId: () => {
    localStorage.removeItem("imagey.userId");
  },
  loadDeviceId: (email: string) => {
    const deviceId = localStorage.getItem(`imagey.deviceIds[${email}]`);
    return deviceId ? deviceId : undefined;
  },
  storeDeviceId: (email: string, deviceId: string) => {
    localStorage.setItem(`imagey.deviceIds[${email}]`, deviceId);
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
  removeRecoveryKey: (deviceId: string) => {
    localStorage.removeItem(`imagey.devices[${deviceId}].recovery-key`);
  },
};
