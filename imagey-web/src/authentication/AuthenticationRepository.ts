export const authenticationRepository = {
  storeKey: async (
    email: string,
    deviceId: string,
    key: JsonWebKey,
  ): Promise<void> => {
    const response = await fetch(
      "/users/" + email + "/public-keys/" + deviceId,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(key),
      },
    );
    return response.status >= 200 && response.status <= 300
      ? Promise.resolve()
      : Promise.reject();
  },
};
