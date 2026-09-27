import { FolderEntry } from "../document/DocumentMetadata";
import { iconTileUrl } from "./iconTile";

export default function FolderImageComponent({
  folder,
  className = "small-width small-height",
  onClick,
}: {
  folder: FolderEntry;
  className?: string;
  onClick: () => void;
}) {
  const name = folder.name || "Folder";
  const url = iconTileUrl("folder", name);

  return (
    <img
      key={folder.documentId}
      src={url}
      alt={folder.name}
      loading="lazy"
      className={className}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    />
  );
}
