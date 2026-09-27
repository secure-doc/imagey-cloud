// Whether the browser can play a file document in-app (pages/Media.tsx)
// instead of downloading/sharing it. Split out from pages/Media.tsx so
// Folder.tsx and SharedDocumentMessage.tsx, which need this to decide
// whether a click navigates to /media/:id, don't import from a page module
// (which also trips react-refresh/only-export-components there, since a
// page file is otherwise expected to export only its component).
export function isPlayableMedia(mimeType: string | undefined): boolean {
  return (
    !!mimeType &&
    (mimeType.startsWith("audio/") || mimeType.startsWith("video/"))
  );
}

// AES-GCM doesn't decrypt incrementally - the encrypted buffer, the
// plaintext and the Blob all sit in memory at once - so a very large file
// isn't loaded at all; the user downloads/shares it instead (see the
// "too large" branch of MediaView in pages/Media.tsx).
export const MAX_INLINE_MEDIA_BYTES = 250 * 1024 * 1024;
