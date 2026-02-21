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
