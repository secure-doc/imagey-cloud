import { cryptoService } from "./CryptoService";

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
      body: JSON.stringify({ email: email }),
    });
    return response.status === 202
      ? Promise.resolve(RegistrationResult.RegistrationStarted)
      : response.status === 409
        ? Promise.resolve(RegistrationResult.AuthenticationStarted)
        : Promise.reject();
  },
  initializeSymmetricKey: async (email: string): Promise<JsonWebKey> => {
    console.log("symmetric key" + email);
    const symmetricJsonWebKey = await cryptoService.initializeSymmetricKey();
    const response = await fetch("/users/" + email + "/symmetric-keys/0", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(symmetricJsonWebKey),
    });
    if (response.ok) {
      console.log("key created");
      return symmetricJsonWebKey;
    }
    if (response.status === 409) {
      console.log("key already created, loading...");
      return authenticationService.loadSymmetricKey(email);
    }
    return Promise.reject();
  },
  loadSymmetricKey: async (email: string): Promise<JsonWebKey> => {
    const response = await fetch("/users/" + email + "/symmetric-keys/0", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    if (response.status === 404) {
      return authenticationService.initializeSymmetricKey(email);
    } else if (response.status === 401 || response.status === 403) {
      return Promise.reject();
    } else {
      return response.json();
    }
  },
};
