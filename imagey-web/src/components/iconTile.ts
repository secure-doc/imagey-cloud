// Shared SVG-data-URL tile generation for a folder grid entry that has no
// thumbnail of its own (a folder, or a non-image file) - an icon plus a
// (possibly truncated) name, rendered as an <img> so it fits wherever a real
// thumbnail would.

export type TileIcon = "folder" | "file" | "video" | "audio";

// Material Icons glyphs (24x24 viewBox), positioned the same way the
// pre-existing folder icon was.
const ICON_PATHS: Record<TileIcon, string> = {
  folder:
    "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
  file: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  video:
    "M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z",
  audio:
    "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z",
};

const ICON_COLORS: Record<TileIcon, string> = {
  folder: "#005CBB",
  file: "#49454F",
  video: "#49454F",
  audio: "#49454F",
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Truncates first (matching the character count the icon has room for),
// THEN escapes - escaping first could cut an entity like "&amp;" in half and
// produce invalid XML. Truncates by code point (Array.from splits on them),
// not by UTF-16 code unit (String.prototype.substring): a name with an
// astral character (e.g. an emoji) exactly on the cut would otherwise be cut
// mid-character, leaving a lone surrogate that later throws
// "URIError: URI malformed" from encodeURIComponent in iconTileUrl below.
function tileLabel(name: string): string {
  const chars = Array.from(name);
  const truncated =
    chars.length > 15 ? `${chars.slice(0, 15).join("")}...` : name;
  return escapeXml(truncated);
}

export function iconTileUrl(icon: TileIcon, name: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="transparent" />
  <g transform="translate(14, 10) scale(3)">
    <path d="${ICON_PATHS[icon]}" fill="${ICON_COLORS[icon]}" />
  </g>
  <text x="50" y="92" font-size="11" font-family="sans-serif" font-weight="500" fill="black" text-anchor="middle">${tileLabel(name)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function fileTileIcon(mimeType: string | undefined): TileIcon {
  if (mimeType?.startsWith("video/")) {
    return "video";
  }
  if (mimeType?.startsWith("audio/")) {
    return "audio";
  }
  return "file";
}
