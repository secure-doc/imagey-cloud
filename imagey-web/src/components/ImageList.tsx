import { FolderEntry } from "../document/DocumentMetadata";
import FolderEntryImageComponent from "./FolderEntryImageComponent";
import FolderImageComponent from "./FolderImageComponent";

interface ImageListProps {
  entries: FolderEntry[];
  folderOwner: string;
  folderKey: JsonWebKey;
  accessPath?: string;
  onFolderClick?: (entry: FolderEntry) => void;
  onImageClick?: (entry: FolderEntry) => void;
}

export default function ImageList({
  entries,
  folderOwner,
  folderKey,
  accessPath,
  onFolderClick,
  onImageClick,
}: ImageListProps) {
  return (
    <div className="column">
      {entries.map((entry) =>
        entry.type === "folder" ? (
          <FolderImageComponent
            key={entry.documentId}
            folder={entry}
            onClick={() => onFolderClick?.(entry)}
          />
        ) : (
          <div key={entry.documentId}>
            <FolderEntryImageComponent
              entry={entry}
              folderOwner={folderOwner}
              folderKey={folderKey}
              accessPath={accessPath}
              onClick={
                entry.type === "image" && onImageClick
                  ? () => onImageClick(entry)
                  : undefined
              }
            />
          </div>
        ),
      )}
    </div>
  );
}
