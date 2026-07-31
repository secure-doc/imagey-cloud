import { createContext, useContext } from "react";

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
  rootFolderId: string;
  chatFolderId: string;
  profileDocumentId: string;
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
