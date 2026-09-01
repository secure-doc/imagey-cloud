import { createContext, useContext } from "react";
import { UserId } from "../authentication/UserId";

export type Email = string;
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
export interface Settings {
  documents: string;
  chats: string;
  profile: string;
  settingsKey: JsonWebKey;
}

// `user` is the account's opaque server id (a UUID). `email` is a best-effort
// display value: the address the user signed in with (from the `?email=` redirect
// param or local storage) - it is not an identifier and may be absent; the
// authoritative list of a user's addresses lives in the encrypted profile document.
interface Authentication {
  user: UserId;
  email?: Email;
  keyPairs: JsonWebKeyPairs;
  settings: Settings;
}

export const AuthenticationContext = createContext<Authentication>(
  {} as Authentication,
);

export function useAuthentication(): Authentication {
  return useContext(AuthenticationContext);
}

export function useUser() {
  return useContext(AuthenticationContext).user;
}
