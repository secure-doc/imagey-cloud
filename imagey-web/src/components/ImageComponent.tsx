import { documentService } from "../document/DocumentService";
import { NewDocumentMetadata } from "../document/DocumentMetadata";
import { useImageBlob } from "../hooks/useImageBlob";
import { ImageThumbnail } from "./ImageThumbnail";

// Renders an already-loaded Document (has its own `key`) or a
// freshly-uploaded NewDocumentMetadata (no `revision` yet) - used by the
// chat message view and the share dialog, both of which already have a
// fully resolved document in hand. For a folder grid entry that has NOT
// been loaded (only its FolderEntry is known), use FolderEntryImageComponent
// instead.
export default function ImageComponent({
  image,
  contentId,
  accessPath,
  className = "small-width small-height",
}: {
  image: NewDocumentMetadata;
  contentId?: string;
  accessPath?: string;
  className?: string;
}) {
  const mimeType = "mimeType" in image ? image.mimeType : undefined;
  const { objectUrl, error } = useImageBlob(
    () => documentService.loadContent(image, contentId, accessPath),
    mimeType,
    [image, contentId, accessPath],
  );

  return (
    <ImageThumbnail
      documentId={image.documentId}
      name={image.name}
      objectUrl={objectUrl}
      error={error}
      className={className}
    />
  );
}
