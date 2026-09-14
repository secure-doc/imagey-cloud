import { documentService } from "../document/DocumentService";
import { FolderEntry } from "../document/DocumentMetadata";
import { useImageBlob } from "../hooks/useImageBlob";
import { ImageThumbnail } from "./ImageThumbnail";

// Renders one folder grid entry's thumbnail directly off the FolderEntry
// embedded in the parent folder - no per-child metadata+key request (see
// documentService.loadFolderEntryContent), unlike ImageComponent which
// needs an already-loaded Document.
export default function FolderEntryImageComponent({
  entry,
  folderOwner,
  folderKey,
  accessPath,
  className = "small-width small-height",
}: {
  entry: FolderEntry;
  folderOwner: string;
  folderKey: JsonWebKey;
  accessPath?: string;
  className?: string;
}) {
  const { objectUrl, error } = useImageBlob(
    () =>
      documentService.loadFolderEntryContent(
        folderOwner,
        entry,
        folderKey,
        accessPath,
      ),
    entry.mimeType,
    [folderOwner, entry, folderKey, accessPath],
  );

  return (
    <ImageThumbnail
      documentId={entry.documentId}
      name={entry.name}
      objectUrl={objectUrl}
      error={error}
      className={className}
    />
  );
}
