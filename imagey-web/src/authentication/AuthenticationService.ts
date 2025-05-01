export enum RegistrationResult {
  RegistrationStarted,
  AuthenticationStarted,
}

export const authenticationService = {
  register: async (email: string): Promise<RegistrationResult> => {
    const response = await fetch("/users/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ email: email }),
    });
    return response.status === 202
      ? Promise.resolve(RegistrationResult.RegistrationStarted)
      : response.status === 409
        ? Promise.resolve(RegistrationResult.AuthenticationStarted)
        : Promise.reject();
  },
};
