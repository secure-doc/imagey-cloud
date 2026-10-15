import { useCallback, useContext } from "react";
import { useUser } from "../contexts/AuthenticationContext";
import { FolderContext, FolderInfo } from "../contexts/FolderContext";
import { useChatsId, useSettingsKey } from "../contexts/SettingsContext";
import { loadChatsDocument, updateChatList } from "../contact/ContactService";
import { HttpError } from "../document/DocumentRepository";

// The folder of "Shared with me" that `folderId` lies in (or is): the topmost folder of its
// foreign chain, the one the share is of.
function sharedRootOf(
  folders: Record<string, FolderInfo>,
  folderId: string,
): string {
  let cur = folderId;
  const seen = new Set<string>();
  while (!seen.has(cur)) {
    seen.add(cur);
    const parent = folders[cur]?.parentId;
    if (!parent || !folders[parent]?.owner) {
      break;
    }
    cur = parent;
  }
  return cur;
}

// Handles a rejected contribution to a folder of another user: a 403 means the owner took the
// right away (or never gave it). The folder then stops offering to add anything and tells the
// user (Folder.tsx shows `contributionsDenied`), and the entry of "Shared with me" learns it,
// so it is right in the next session as well. Anything else is not handled here (`handle`
// returns false).
export function useContributionDenied(folderId: string): {
  handle: (error: unknown) => boolean;
} {
  const { folders, registerFolder } = useContext(FolderContext);
  const user = useUser();
  const chatsId = useChatsId();
  const settingsKey = useSettingsKey();
  const handle = useCallback(
    (error: unknown) => {
      if (!(error instanceof HttpError) || error.status !== 403) {
        return false;
      }
      registerFolder(folderId, {
        contributions: false,
        contributionsDenied: true,
      });
      const rootId = sharedRootOf(folders, folderId);
      if (rootId !== folderId) {
        registerFolder(rootId, { contributions: false });
      }
      if (folders[rootId]?.owner) {
        markReadOnly(user, chatsId, settingsKey, rootId).catch((e) =>
          console.warn("Could not record the withdrawn right", e),
        );
      }
      return true;
    },
    [folderId, folders, registerFolder, user, chatsId, settingsKey],
  );
  return { handle };
}

async function markReadOnly(
  user: string,
  chatsId: string,
  settingsKey: JsonWebKey,
  sharedFolderId: string,
): Promise<void> {
  const chats = await loadChatsDocument(user, chatsId, settingsKey);
  if (
    !chats.sharedFolders?.some(
      (f) => f.documentId === sharedFolderId && f.contributions,
    )
  ) {
    return;
  }
  await updateChatList(user, chats, (current) => ({
    ...current,
    sharedFolders: (current.sharedFolders ?? []).map((f) =>
      f.documentId === sharedFolderId ? { ...f, contributions: false } : f,
    ),
  }));
}
