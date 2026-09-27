import { ReactNode, useMemo, useState } from "react";
import { useActionIcons } from "../contexts/ActionBarContext";
import { useOpenDocument } from "./useOpenDocument";

// Registers an app-bar "download" action icon (desktop: download, mobile:
// share sheet - see useOpenDocument) for a detail page (image or media).
// `target` is undefined while there's nothing to download yet (e.g. the
// image detail page hasn't loaded the original's contentId) - no icon is
// shown then. The caller must memoize `target` itself (useActionIcons needs
// a stable icons array reference to avoid re-running its effect every
// render).
export function useDownloadAction(
  target:
    | {
        name: string;
        mimeType?: string;
        load: () => Promise<ArrayBuffer | Blob>;
      }
    | undefined,
): ReactNode {
  const { open, element } = useOpenDocument();
  const [busy, setBusy] = useState(false);

  const icons = useMemo(
    () =>
      target
        ? [
            <button
              key="download"
              className="circle transparent"
              aria-label="download"
              disabled={busy}
              onClick={() => {
                if (busy) {
                  return;
                }
                setBusy(true);
                open(target.name, target.mimeType, target.load).finally(() =>
                  setBusy(false),
                );
              }}
            >
              {busy ? (
                <progress className="circle small"></progress>
              ) : (
                <i>download</i>
              )}
            </button>,
          ]
        : [],
    [target, busy, open],
  );
  useActionIcons(icons);

  return element;
}
