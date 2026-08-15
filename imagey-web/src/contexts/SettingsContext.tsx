import { createContext, useContext } from "react";

export interface SettingsContextState {
  settingsKey: JsonWebKey;
  documentsId: string;
  chatsId: string;
  profileId: string;
}

export const SettingsContext = createContext<SettingsContextState>(
  {} as SettingsContextState,
);

export function useSettingsKey(): JsonWebKey {
  return useContext(SettingsContext).settingsKey;
}

export function useDocumentsId(): string {
  return useContext(SettingsContext).documentsId;
}

export function useChatsId(): string {
  return useContext(SettingsContext).chatsId;
}

export function useProfileId(): string {
  return useContext(SettingsContext).profileId;
}
