import DocumentMetadata from "../document/DocumentMetadata";
import ImageComponent from "./ImageComponent";
import FolderImageComponent from "./FolderImageComponent";

interface ImageListProps {
  documents: DocumentMetadata[];
  onImageClick?: (document: DocumentMetadata) => void;
  onFolderClick?: (document: DocumentMetadata) => void;
}

export default function ImageList({
  documents,
  onImageClick,
  onFolderClick,
}: ImageListProps) {
  return (
    <div className="column">
      {documents.map((doc) => {
        if (doc.type?.toLowerCase() === "folder") {
          return (
            <FolderImageComponent
              key={doc.documentId}
              folder={doc}
              onClick={() => onFolderClick?.(doc)}
            />
          );
        }

        if (doc.type?.toLowerCase() === "chat") {
          return null;
        }

        if (onImageClick) {
          return (
            <a
              key={doc.documentId}
              onClick={(e) => {
                e.preventDefault();
                onImageClick(doc);
              }}
              className="pointer"
            >
              <ImageComponent image={doc} />
            </a>
          );
        }
        return <ImageComponent key={doc.documentId} image={doc} />;
      })}
    </div>
  );
}
