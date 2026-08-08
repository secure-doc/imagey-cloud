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
export interface Settings {
  documents: string;
  chats: string;
  profile: string;
  settingsKey: JsonWebKey;
}
export const AuthenticationContext = createContext<{
  user: Email;
  keyPairs: JsonWebKeyPairs;
  settings: Settings;
}>({} as { user: Email; keyPairs: JsonWebKeyPairs; settings: Settings });

export function useAuthentication(): {
  user: Email;
  keyPairs: JsonWebKeyPairs;
  settings: Settings;
} {
  return useContext(AuthenticationContext);
}

export function useUser() {
  return useContext(AuthenticationContext).user;
}
