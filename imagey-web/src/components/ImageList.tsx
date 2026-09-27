import { FolderEntry } from "../document/DocumentMetadata";
import FileComponent from "./FileComponent";
import FolderEntryImageComponent from "./FolderEntryImageComponent";
import FolderImageComponent from "./FolderImageComponent";

interface ImageListProps {
  entries: FolderEntry[];
  folderOwner: string;
  folderKey: JsonWebKey;
  accessPath?: string;
  onFolderClick?: (entry: FolderEntry) => void;
  onImageClick?: (entry: FolderEntry) => void;
  onFileClick: (entry: FolderEntry) => void | Promise<void>;
}

export default function ImageList({
  entries,
  folderOwner,
  folderKey,
  accessPath,
  onFolderClick,
  onImageClick,
  onFileClick,
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
        ) : entry.type === "file" ? (
          <div key={entry.documentId}>
            <FileComponent
              name={entry.name}
              mimeType={entry.mimeType}
              onClick={() => onFileClick(entry)}
            />
          </div>
        ) : (
          <div key={entry.documentId}>
            <FolderEntryImageComponent
              entry={entry}
              folderOwner={folderOwner}
              folderKey={folderKey}
              accessPath={accessPath}
              onClick={onImageClick ? () => onImageClick(entry) : undefined}
            />
          </div>
        ),
      )}
    </div>
  );
}
