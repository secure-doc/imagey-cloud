import { useEffect, useRef, useState } from "react";
import { fileTileIcon, iconTileUrl } from "./iconTile";

// A folder/chat tile for a non-image document (type "file"): an icon +
// name, clickable to either open a media detail page or trigger
// download/share (see useOpenDocument) - the caller decides which via
// `onClick`. Unlike ImageThumbnail there is no content to load here, only
// the click action, which can itself take a moment (decrypting the file) -
// `busy` shows a progress indicator over the icon and ignores further
// clicks meanwhile.
export default function FileComponent({
  documentId,
  name,
  mimeType,
  className = "small-width small-height",
  onClick,
}: {
  documentId: string;
  name: string;
  mimeType: string | undefined;
  className?: string;
  onClick: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  // Not just `() => () => { mounted.current = false }`: under StrictMode's
  // dev-only mount->cleanup->mount double-invoke, that cleanup would leave
  // the ref permanently false after the very first mount, since nothing
  // ever sets it back to true - the effect body has to do that itself.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const handleClick = () => {
    if (busy) {
      return;
    }
    setBusy(true);
    Promise.resolve(onClick()).finally(() => {
      if (mounted.current) {
        setBusy(false);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      key={documentId}
      className={className}
      style={{ position: "relative", cursor: "pointer" }}
      role="button"
      tabIndex={0}
      aria-label={name}
      aria-busy={busy}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <img
        src={iconTileUrl(fileTileIcon(mimeType), name)}
        alt=""
        loading="lazy"
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      />
      {busy && (
        <progress
          className="circle small"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        ></progress>
      )}
    </div>
  );
}
