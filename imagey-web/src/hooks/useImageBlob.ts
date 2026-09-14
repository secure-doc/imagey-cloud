import { DependencyList, useEffect, useMemo, useState } from "react";
import { useObjectUrl } from "./useObjectUrl";

// Loads an image's raw content via `load`, wraps it as a Blob (re-coercing a
// generic "image/*" mimeType to "image/png", since a re-encoded thumbnail
// doesn't preserve the original format), and returns an object URL for it
// plus an `error` flag. Shared by ImageComponent and FolderEntryImageComponent,
// which differ only in how they fetch the raw bytes. `load` re-runs whenever
// `deps` changes by value - same JSON.stringify-keyed convention as
// useReloadableLoad, so a same-content-but-new-reference prop doesn't
// re-trigger a redundant reload.
export function useImageBlob(
  load: () => Promise<ArrayBuffer>,
  mimeType: string | undefined,
  deps: DependencyList,
): { objectUrl: string | undefined; error: boolean } {
  const [content, setContent] = useState<ArrayBuffer | undefined>();
  const [error, setError] = useState(false);
  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    setContent(undefined);
    setError(false);
    load()
      .then((content) => setContent(content))
      .catch((e) => {
        console.error("Error loading image content", e);
        setError(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  const blob = useMemo(
    () =>
      content
        ? new Blob([content], {
            type: mimeType?.startsWith("image/") ? "image/png" : mimeType,
          })
        : undefined,
    [content, mimeType],
  );
  const objectUrl = useObjectUrl(blob);

  return { objectUrl, error };
}
