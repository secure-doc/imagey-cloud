export const deviceRepository = {
  loadUser: () => {
    const email = localStorage.getItem("imagey.user");
    return email ? email : undefined;
  },
  storeUser: (user: string) => {
    localStorage.setItem("imagey.user", user);
  },
  loadDeviceId: (email: string) => {
    const deviceId = localStorage.getItem("imagey.deviceIds[" + email + "]");
    return deviceId ? deviceId : undefined;
  },
  loadKey: (deviceId: string) => {
    const key = localStorage.getItem("imagey.devices[" + deviceId + "].key");
    return key ? key : undefined;
  },
  storeKey: (deviceId: string, encryptedPrivateKey: string) => {
    localStorage.setItem(
      "imagey.devices[" + deviceId + "].key",
      encryptedPrivateKey,
    );
  },
};
