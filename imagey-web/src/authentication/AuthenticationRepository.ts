export const authenticationRepository = {
  storeKey: async (
    email: string,
    deviceId: string,
    key: JsonWebKey,
    token?: string,
  ): Promise<void> => {
    const response = await fetch(
      "/users/" + email + "/devices/" + deviceId + "/keys/0",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify(key),
      },
    );
    return response.status >= 200 && response.status <= 300
      ? Promise.resolve()
      : Promise.reject();
  },
};
