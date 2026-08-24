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

export function useKey(folderId: string): JsonWebKey | undefined {
  const folderContext = useContext(FolderContext);
  const cachedKey = folderContext.folders[folderId]?.key;
  const parentId = useParentFolderId(folderId);
  const parentKey = useKey(parentId);
  const user = useUser();
  const [key, setKey] = useState<JsonWebKey>();
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
