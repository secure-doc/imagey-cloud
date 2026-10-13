import { useContext, useEffect, useMemo, useState } from "react";
import { useUser } from "../contexts/AuthenticationContext";
import {
  FolderContext,
  useAccessPath,
  useKey,
} from "../contexts/FolderContext";
import { useDocumentsId } from "../contexts/SettingsContext";
import { servicesFor } from "../api/servicesFor";
import { normalizeOrigin } from "../api/RemoteApiClient";
import { foreignOriginsOf, placeOf } from "../federation/whereabouts";
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
  // The server of a document shared from another one (F8), as given in the URL.
  originParam: string | null,
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
  // From the URL, so untrusted: only a well-formed origin passes, the own one counts as none.
  const origin = useMemo(() => {
    if (!originParam || folder) {
      return { value: undefined, valid: true };
    }
    try {
      return { value: normalizeOrigin(originParam), valid: true };
    } catch {
      return { value: undefined, valid: false };
    }
  }, [originParam, folder]);
  const isOwner = origin.value === undefined && owner === user;

  // Both keys are resolved unconditionally (rules of hooks) and the one that
  // matches the entry point is used. Only a non-owner needs the chat key: the
  // owner reaches the document through their own root folder.
  const folderKey = useKey(folder ?? "");
  const rootFolderKey = useKey(documentsId);
  const {
    key: chatKey,
    contact,
    failed: chatKeyFailed,
  } = useChatKey(needsResolving && !isOwner ? chat : null);

  // The origin of a document in the URL is only followed to a server the contact of the chat is
  // known to live on (foreignOriginsOf): any other would log us in there with an address of ours.
  const originRefused =
    !!origin.value &&
    !!contact &&
    !foreignOriginsOf(contact).includes(origin.value);
  const originAllowed = !origin.value || (!!contact && !originRefused);

  const parentKey = folder ? folderKey : isOwner ? rootFolderKey : chatKey;
  const accessPath = useAccessPath(id, owner);

  const [loaded, setLoaded] = useState<{ id: string; info?: T }>();

  const canResolve =
    needsResolving &&
    !folderUnresolvable &&
    origin.valid &&
    !!(folder || (chat && ownerParam));
  useEffect(() => {
    if (!canResolve || !parentKey || !originAllowed) {
      return;
    }
    let cancelled = false;
    (async () => {
      // The key entry of a document shared with us hangs under our id on ITS server.
      const parentId = folder
        ? folder
        : isOwner
          ? documentsId
          : (await placeOf(origin.value, user)).selfId;
      return servicesFor(origin.value).documents.loadDocument(
        owner,
        id,
        parentId,
        parentKey,
        undefined,
        accessPath,
      );
    })()
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
  }, [
    canResolve,
    owner,
    id,
    folder,
    isOwner,
    documentsId,
    user,
    origin,
    parentKey,
    originAllowed,
    accessPath,
    chat,
    toInfo,
  ]);

  if (registered) {
    return { info: registered, failed: false };
  }
  if (loaded?.id === id && loaded.info) {
    return { info: loaded.info, failed: false };
  }
  return {
    failed:
      !canResolve ||
      originRefused ||
      loaded?.id === id ||
      (!!chat && chatKeyFailed),
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
