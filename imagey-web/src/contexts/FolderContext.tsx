import { createContext, useContext, useEffect, useState } from "react";
import { useUser } from "./AuthenticationContext";
import { documentService } from "../document/DocumentService";

export interface FolderInfo {
  parentId?: string;
  key?: JsonWebKey;
}

export interface FolderContextState {
  folders: Record<string, FolderInfo>;
  registerParentFolder: (folderId: string, parentId: string) => void;
  registerKey: (folderId: string, key: JsonWebKey) => void;
}

export const FolderContext = createContext<FolderContextState>(
  {} as FolderContextState,
);

export function useParentFolderId(folderId: string): string {
  return useContext(FolderContext).folders[folderId]?.parentId || "";
}

/**
 * Builds the {@code Access-Path} proof-hint header for a non-owner access to
 * {@code documentId} in {@code owner}'s tree (ADR 0009). Walks the known
 * {@code parentId} chain up to (but not into) the caller's own settings
 * document, emitting one {@code {doc, owner, wrappedBy}} hop per level plus a
 * self-referential terminus hop for the topmost shared folder.
 *
 * Returns {@code undefined} - meaning "send no header" - when {@code owner} is
 * the caller (own tree) or when no parent chain is known (a direct chat / folder
 * share, which the server resolves by its direct-grant scan without a header).
 */
export function buildAccessPath(
  folders: Record<string, FolderInfo>,
  userId: string,
  documentId: string,
  owner: string,
): string | undefined {
  if (!owner || owner === userId) {
    return undefined;
  }
  const hops: { doc: string; owner: string; wrappedBy: string }[] = [];
  const seen = new Set<string>();
  let cur = documentId;
  while (
    folders[cur]?.parentId &&
    folders[cur].parentId !== userId &&
    !seen.has(cur)
  ) {
    seen.add(cur);
    const parent = folders[cur].parentId as string;
    hops.push({ doc: cur, owner, wrappedBy: parent });
    cur = parent;
  }
  if (hops.length === 0) {
    return undefined;
  }
  hops.push({ doc: cur, owner, wrappedBy: cur });
  const json = JSON.stringify({ chain: hops });
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function useAccessPath(
  documentId: string,
  owner: string,
): string | undefined {
  const { folders } = useContext(FolderContext);
  const user = useUser();
  return buildAccessPath(folders, user, documentId, owner);
}

export function useKey(folderId: string): JsonWebKey | undefined {
  const folderContext = useContext(FolderContext);
  const cachedKey = folderContext.folders[folderId]?.key;
  const parentId = useParentFolderId(folderId);
  const parentKey = folderContext.folders[parentId]?.key;

  const user = useUser();
  const [key, setKey] = useState<JsonWebKey>();
  // Drop the previously resolved key the moment the folder id changes, so a
  // consumer never briefly sees the old folder's key paired with the new id
  // (which would make it load children with the wrong key - broken-item flashes
  // and spurious "loadDocument failed" logs until this hook re-resolves).
  useEffect(() => {
    setKey(undefined);
  }, [folderId]);
  useEffect(() => {
    if (cachedKey || !parentKey) {
      return;
    }
    documentService.loadKey(user, folderId, parentId, parentKey).then((key) => {
      setKey(key);
      folderContext.registerKey(folderId, key);
    });
  }, [user, folderId, parentId, parentKey, cachedKey, folderContext]);
  return cachedKey || key;
}
