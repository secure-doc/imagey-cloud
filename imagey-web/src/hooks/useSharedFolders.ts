import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useUser } from "../contexts/AuthenticationContext";
import { FolderContext } from "../contexts/FolderContext";
import { useChatsId, useSettingsKey } from "../contexts/SettingsContext";
import { loadChatsDocument } from "../contact/ContactService";
import { SharedFolderEntry } from "../document/DocumentMetadata";

// Loads the folders shared with the user from the "chats" document: `folders` is `undefined`
// while loading and `null` if that failed (`reload` tries again).
export function useSharedFolders(enabled = true): {
  folders: SharedFolderEntry[] | null | undefined;
  reload: () => void;
} {
  const user = useUser();
  const chatsId = useChatsId();
  const settingsKey = useSettingsKey();
  const [folders, setFolders] = useState<SharedFolderEntry[] | null>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    loadChatsDocument(user, chatsId, settingsKey)
      .then((loaded) => {
        if (!cancelled) {
          setFolders(loaded.sharedFolders ?? []);
        }
      })
      .catch((e) => {
        console.error("Failed to load the shared folders", e);
        if (!cancelled) {
          setFolders(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, user, chatsId, settingsKey, attempt]);
  const reload = useCallback(() => {
    setFolders(undefined);
    setAttempt((n) => n + 1);
  }, []);
  return { folders, reload };
}

// Makes a shared folder reachable: remembers where it lives and its key.
export function useRegisterSharedFolder() {
  const { registerFolder } = useContext(FolderContext);
  return useCallback(
    (entry: SharedFolderEntry) =>
      registerFolder(entry.documentId, {
        key: entry.folderKey,
        owner: entry.owner,
        origin: entry.chatOrigin,
        contributions: entry.contributions,
      }),
    [registerFolder],
  );
}

// ... and shows it.
export function useOpenSharedFolder() {
  const register = useRegisterSharedFolder();
  const navigate = useNavigate();
  return (entry: SharedFolderEntry) => {
    register(entry);
    navigate(`/documents/${entry.documentId}`);
  };
}
