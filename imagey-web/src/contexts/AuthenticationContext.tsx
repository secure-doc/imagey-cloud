import { createContext, useContext } from "react";

export type Email = string;
export interface JsonWebKeyPair {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}
export interface JsonWebKeyPairs {
  mainKeyPair: JsonWebKeyPair;
  deviceKeyPair: JsonWebKeyPair;
}
export const AuthenticationContext = createContext<{
  user: Email;
  keyPairs: JsonWebKeyPairs;
}>({} as { user: Email; keyPairs: JsonWebKeyPairs });

export function useAuthentication(): {
  user: Email;
  keyPairs: JsonWebKeyPairs;
} {
  return useContext(AuthenticationContext);
}

/* istanbul ignore next */
export function useCurrentUser(): Email {
  return useAuthentication().user;
}

/*
export function usePublicMainKey(): JsonWebKey {
  return useAuthentication().keyPairs.mainKeyPair.publicKey;
}
*/

export function usePrivateMainKey(): JsonWebKey {
  return useAuthentication().keyPairs.mainKeyPair.privateKey;
}

/*
export function usePublicDeviceKey(): JsonWebKey {
  return useAuthentication().keyPairs.deviceKeyPair.publicKey;
}
*/

export function usePrivateDeviceKey(): JsonWebKey {
  return useAuthentication().keyPairs.deviceKeyPair.privateKey;
}
