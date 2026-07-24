import { createContext, useContext } from "react";

export type Email = string;
export type UserId = string;
export type EncryptedSharedKey = string;
export type Kid = "0";
export interface JsonWebKeyPair {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}
export interface JsonWebKeyPairs {
  mainKeyPair: JsonWebKeyPair;
  deviceKeyPair: JsonWebKeyPair;
}
export const AuthenticationContext = createContext<{
  email: Email;
  userId: UserId;
  keyPairs: JsonWebKeyPairs;
}>({} as { email: Email; userId: UserId; keyPairs: JsonWebKeyPairs });

export function useAuthentication(): {
  email: Email;
  userId: UserId;
  keyPairs: JsonWebKeyPairs;
} {
  return useContext(AuthenticationContext);
}
