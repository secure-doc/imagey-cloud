import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useUser } from "./AuthenticationContext";
import { documentService } from "../document/DocumentService";

export interface FolderInfo {
  parentId?: string;
  key?: JsonWebKey;
  // Set for a folder of another user's tree (a shared folder or one below it):
  // its owner, and the server it lives on if that is not the own one.
  owner?: string;
  origin?: string;
  // Whether the owner allows contributions (as told, display only - the server decides).
  contributions?: boolean;
  // A contribution was refused (403): the user is told once.
  contributionsDenied?: boolean;
}

export interface FolderContextState {
  folders: Record<string, FolderInfo>;
  registerParentFolder: (folderId: string, parentId: string) => void;
  registerKey: (folderId: string, key: JsonWebKey) => void;
  // Merges what is known about a folder, e.g. where a shared folder lives.
  registerFolder: (folderId: string, info: Partial<FolderInfo>) => void;
}

export const FolderContext = createContext<FolderContextState>(
  {} as FolderContextState,
);

export function useParentFolderId(folderId: string): string {
  return useContext(FolderContext).folders[folderId]?.parentId || "";
}

type Hop = { doc: string; owner: string; wrappedBy: string };

/**
 * The hops of {@code startId}'s folder chain, as far as it is known: one hop
 * per folder, each in its owner's tree (a folder registered with an owner is
 * somebody else's; any other belongs to the caller). The chain ends at the
 * first folder of the caller's own tree - the server accepts a hop the caller
 * owns as the terminus - or, for a shared folder, at the topmost known folder,
 * the one the caller holds a direct grant on.
 */
function folderChain(
  folders: Record<string, FolderInfo>,
  userId: string,
  startId: string,
  startOwner: string,
): Hop[] {
  const hops: Hop[] = [];
  const seen = new Set<string>();
  let cur = startId;
  let owner = startOwner;
  while (!seen.has(cur)) {
    seen.add(cur);
    const parent = folders[cur]?.parentId;
    if (owner === userId || !parent || parent === userId) {
      hops.push({ doc: cur, owner, wrappedBy: cur });
      return hops;
    }
    hops.push({ doc: cur, owner, wrappedBy: parent });
    cur = parent;
    owner = folders[cur]?.owner ?? userId;
  }
  return hops;
}

/**
 * Builds the {@code Access-Path} proof-hint header for a non-owner access to
 * {@code documentId} in {@code owner}'s tree (ADR 0009): one {@code {doc, owner,
 * wrappedBy}} hop per level of the known {@code parentId} chain (see
 * folderChain for where it ends).
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
  const hops = folderChain(folders, userId, documentId, owner);
  return hops.length > 1 ? encodeAccessPath(hops) : undefined;
}

/**
 * Builds the {@code Access-Path} header for a CHILD of a folder (an entry of
 * {@code folderId}'s content) owned by {@code childOwner}: the child's key is
 * wrapped by the folder, so the chain starts with the child and continues with
 * the folder's own chain (docs/plans/share-folders.md §2.4). Returns
 * {@code undefined} - "send no header" - when child and folder both belong to
 * the caller.
 */
export function buildChildAccessPath(
  folders: Record<string, FolderInfo>,
  userId: string,
  childId: string,
  childOwner: string,
  folderId: string,
  folderOwner: string,
): string | undefined {
  if ((!childOwner || childOwner === userId) && folderOwner === userId) {
    return undefined;
  }
  return encodeAccessPath([
    { doc: childId, owner: childOwner, wrappedBy: folderId },
    ...folderChain(folders, userId, folderId, folderOwner),
  ]);
}

function encodeAccessPath(hops: Hop[]): string {
  const json = JSON.stringify({ chain: hops });
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Builds the {@code Access-Path} header for a document shared INTO a group
 * (ADR 0019 decision 4): a two-hop chain from the shared document (in
 * {@code sharerId}'s tree, wrapped by the group) to the group Document itself
 * (in {@code groupOwnerId}'s tree, self-referential terminus) - the same
 * shape {@code buildAccessPath} emits for a folder share, just built directly
 * instead of walked off the folder registry (groups are not folders, so they
 * are not registered there). Returns {@code undefined} - "send no header" -
 * when {@code sharerId} is the caller (their own document, no share to prove).
 */
export function buildGroupAccessPath(
  userId: string,
  documentId: string,
  sharerId: string,
  groupId: string,
  groupOwnerId: string,
): string | undefined {
  if (!sharerId || sharerId === userId) {
    return undefined;
  }
  return encodeAccessPath([
    { doc: documentId, owner: sharerId, wrappedBy: groupId },
    { doc: groupId, owner: groupOwnerId, wrappedBy: groupId },
  ]);
}

export function useAccessPath(
  documentId: string,
  owner: string,
): string | undefined {
  const { folders } = useContext(FolderContext);
  const user = useUser();
  return buildAccessPath(folders, user, documentId, owner);
}

// The Access-Path of the entries of a folder, per entry (see buildChildAccessPath).
export function useChildAccessPath(
  folderId: string,
  folderOwner: string,
): (childId: string, childOwner?: string) => string | undefined {
  const { folders } = useContext(FolderContext);
  const user = useUser();
  return useCallback(
    (childId: string, childOwner?: string) =>
      buildChildAccessPath(
        folders,
        user,
        childId,
        childOwner ?? folderOwner,
        folderId,
        folderOwner,
      ),
    [folders, user, folderId, folderOwner],
  );
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
