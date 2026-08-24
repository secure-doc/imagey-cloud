import { useEffect, useState } from "react";

// Turns a Blob into an object URL for the lifetime of that Blob, revoking the
// previous URL whenever the Blob changes or the component unmounts. Creating
// object URLs in a render body (or never revoking them) leaks a blob URL on
// every re-render until the browser runs out of blob memory
// (net::ERR_BLOB_OUT_OF_MEMORY).
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>();

  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  return url;
}
