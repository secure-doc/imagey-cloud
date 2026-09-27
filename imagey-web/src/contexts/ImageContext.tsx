import { createContext, useContext } from "react";

// Everything the image detail page needs to render a document without any
// further metadata/key request. Kept in memory only (never in history state or
// the URL): `documentKey` is a secret.
export interface ImageInfo {
  documentId: string;
  name: string;
  owner: string;
  documentKey: JsonWebKey;
  mediumImageId: string;
  // Only known from the chat; shown as a placeholder while the medium image loads.
  smallImageId?: string;
  mimeType?: string;
  accessPath?: string;
}

export interface ImageContextState {
  images: Record<string, ImageInfo>;
  registerImage: (info: ImageInfo) => void;
}

export const ImageContext = createContext<ImageContextState>({
  images: {},
  registerImage: () => {},
});

export function useImageInfo(id: string): ImageInfo | undefined {
  return useContext(ImageContext).images[id];
}
