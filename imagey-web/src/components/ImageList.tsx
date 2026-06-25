import Document from "../document/Document";
import ImageComponent from "./ImageComponent";

interface ImageListProps {
  documents: Document[];
  onImageClick?: (document: Document) => void;
}

export default function ImageList({ documents, onImageClick }: ImageListProps) {
  return (
    <div className="column">
      {documents.map((doc) => {
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
