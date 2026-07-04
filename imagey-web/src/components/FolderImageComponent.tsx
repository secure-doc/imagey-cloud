import DocumentMetadata from "../document/DocumentMetadata";

export default function FolderImageComponent({
  folder,
  className = "small-width small-height",
  onClick,
}: {
  folder: DocumentMetadata;
  className?: string;
  onClick?: () => void;
}) {
  const name = folder.name || "Folder";

  // Create an SVG with a transparent background, a blue folder icon, and the folder name text
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="transparent" />
  <g transform="translate(14, 10) scale(3)">
    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" fill="#005CBB" />
  </g>
  <text x="50" y="92" font-size="11" font-family="sans-serif" font-weight="500" fill="black" text-anchor="middle">${name.substring(0, 15)}${name.length > 15 ? "..." : ""}</text>
</svg>`;

  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return (
    <img
      key={folder.documentId}
      src={url}
      alt={folder.name}
      loading="lazy"
      className={className}
      onClick={() => {
        console.log("Folder clicked!", folder.documentId);
        if (onClick) onClick();
      }}
      style={{ cursor: onClick ? "pointer" : "default" }}
    />
  );
}
