import { servicesFor } from "../api/servicesFor";
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
  folderOrigin,
  folderKey,
  accessPath,
  className = "small-width small-height",
  onClick,
}: {
  entry: FolderEntry;
  folderOwner: string;
  folderOrigin?: string;
  folderKey: JsonWebKey;
  accessPath?: string;
  className?: string;
  onClick?: () => void;
}) {
  const { objectUrl, error } = useImageBlob(
    () =>
      servicesFor(folderOrigin).documents.loadFolderEntryContent(
        entry.owner ?? folderOwner,
        entry,
        folderKey,
        accessPath,
      ),
    entry.mimeType,
    [folderOwner, folderOrigin, entry, folderKey, accessPath],
  );

  return (
    <ImageThumbnail
      documentId={entry.documentId}
      name={entry.name}
      objectUrl={objectUrl}
      error={error}
      className={className}
      onClick={onClick}
    />
  );
}
