import { createContext, useContext } from "react";

// Everything a detail page (image or media) needs to render a document
// without any further metadata/key request. Kept in memory only (never in
// history state or the URL): `documentKey` is a secret.
interface DetailBase {
  documentId: string;
  name: string;
  owner: string;
  documentKey: JsonWebKey;
  mimeType?: string;
  accessPath?: string;
}

export interface ImageInfo extends DetailBase {
  kind: "image";
  mediumImageId: string;
  // Only known from the chat; shown as a placeholder while the medium image loads.
  smallImageId?: string;
  // The original's file id (for the download action) - known when registered
  // from a chat or resolved after a reload; absent when opened from a
  // folder (FolderEntry carries no contentId), then loaded lazily on
  // download.
  contentId?: string;
}

export interface MediaInfo extends DetailBase {
  kind: "media";
  mimeType: string; // audio/* or video/*
  contentId: string;
  size: number;
}

export type DetailInfo = ImageInfo | MediaInfo;

export interface DetailContextState {
  details: Record<string, DetailInfo>;
  registerDetail: (info: DetailInfo) => void;
}

export const DetailContext = createContext<DetailContextState>({
  details: {},
  registerDetail: () => {},
});

// Returns the registered entry for `id` only if it's the expected `kind` -
// the image and media detail pages otherwise ignore a stale/mismatched
// registration and fall back to resolving from the URL.
export function useDetailInfo<K extends DetailInfo["kind"]>(
  id: string,
  kind: K,
): Extract<DetailInfo, { kind: K }> | undefined {
  const info = useContext(DetailContext).details[id];
  return info?.kind === kind
    ? (info as Extract<DetailInfo, { kind: K }>)
    : undefined;
}
