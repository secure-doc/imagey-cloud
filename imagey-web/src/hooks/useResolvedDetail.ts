import { useContext, useEffect, useState } from "react";
import { useUser } from "../contexts/AuthenticationContext";
import {
  FolderContext,
  useAccessPath,
  useKey,
} from "../contexts/FolderContext";
import { useDocumentsId } from "../contexts/SettingsContext";
import { documentService } from "../document/DocumentService";
import Document from "../document/Document";
import { DetailInfo } from "../contexts/DetailContext";
import { useChatKey } from "./useChatKey";

// Resolves a detail page's document (image or media) after a reload or deep
// link, where the caller hasn't registered anything yet - shared by
// pages/Image.tsx and pages/Media.tsx, which differ only in `toInfo` (which
// document types/shapes they accept). `toInfo` must be a stable reference
// (a module-level constant) - it sits in the effect's dependency array, and
// a fresh function every render would re-trigger the resolve on every
// render.
export function useResolvedDetail<T extends DetailInfo>(
  id: string,
  registered: T | undefined,
  folder: string | null,
  chat: string | null,
  ownerParam: string | null,
  toInfo: (
    doc: Document,
    accessPath: string | undefined,
    fromChat: boolean,
  ) => T | undefined,
): { info?: T; failed: boolean } {
  const user = useUser();
  const documentsId = useDocumentsId();
  const needsResolving = !registered;
  // After a reload only the root folder's parent is known again (App.tsx); the
  // key of a sub-folder can't be derived, so its documents can't be resolved.
  const { folders } = useContext(FolderContext);
  const folderUnresolvable =
    !!folder && folder !== documentsId && !folders[folder]?.parentId;

  const owner = folder ? user : (ownerParam ?? "");
  const isOwner = owner === user;

  // Both keys are resolved unconditionally (rules of hooks) and the one that
  // matches the entry point is used. Only a non-owner needs the chat key: the
  // owner reaches the document through their own root folder.
  const folderKey = useKey(folder ?? "");
  const rootFolderKey = useKey(documentsId);
  const { key: chatKey, failed: chatKeyFailed } = useChatKey(
    needsResolving && !isOwner ? chat : null,
  );

  const parentId = folder ? folder : isOwner ? documentsId : user;
  const parentKey = folder ? folderKey : isOwner ? rootFolderKey : chatKey;
  const accessPath = useAccessPath(id, owner);

  const [loaded, setLoaded] = useState<{ id: string; info?: T }>();

  const canResolve =
    needsResolving && !folderUnresolvable && !!(folder || (chat && ownerParam));
  useEffect(() => {
    if (!canResolve || !parentKey) {
      return;
    }
    let cancelled = false;
    documentService
      .loadDocument(owner, id, parentId, parentKey, undefined, accessPath)
      .then((doc) => {
        if (cancelled) {
          return;
        }
        setLoaded({ id, info: toInfo(doc, accessPath, !!chat) });
      })
      .catch(() => !cancelled && setLoaded({ id }));
    return () => {
      cancelled = true;
    };
  }, [canResolve, owner, id, parentId, parentKey, accessPath, chat, toInfo]);

  if (registered) {
    return { info: registered, failed: false };
  }
  if (loaded?.id === id && loaded.info) {
    return { info: loaded.info, failed: false };
  }
  return {
    failed: !canResolve || loaded?.id === id || (!!chat && chatKeyFailed),
  };
}

// The "back" target for a detail page reached from a folder or a chat - the
// same in the image and media detail pages.
export function useDetailBackPath(
  folder: string | null,
  chat: string | null,
): string | undefined {
  return folder ? `/documents/${folder}` : chat ? `/chats/${chat}` : undefined;
}
