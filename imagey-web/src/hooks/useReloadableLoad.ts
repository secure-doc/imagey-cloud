import { DependencyList, useEffect, useRef, useState } from "react";

interface Options {
  // How long to wait before an automatic retry after a failed load.
  retryDelayMs?: number;
  // How many automatic retries to attempt before giving up.
  maxRetries?: number;
}

// Runs `load` once per distinct `deps` value and, on failure, retries it on a
// short timer up to `maxRetries` times.
//
// Two problems it papers over (see the callers):
//   - StrictMode invokes an effect twice (mount -> cleanup -> mount) for every
//     real mount. A ref (unlike state) survives that synthetic double-invoke,
//     so the second invocation recognizes the load for this identity is already
//     under way and skips re-issuing it - while a genuine remount starts with a
//     fresh ref and reloads normally.
//   - `documentService.loadDocument` never rejects: a failed fetch/decrypt
//     comes back as a `loadFailed` placeholder. `load` must detect that and
//     return `false`, otherwise a transient 5xx would leave the caller silently
//     empty forever behind the load-once ref.
//
// `load` returns `true` when the data is good and `false` when it is not (the
// hook then clears the ref and schedules a retry).
export function useReloadableLoad(
  load: () => Promise<boolean>,
  deps: DependencyList,
  { retryDelayMs = 4000, maxRetries = 3 }: Options = {},
): { failed: boolean } {
  const [failed, setFailed] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const loadedForRef = useRef<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    const loadKey = `${depsKey}:${reloadCount}`;
    if (loadedForRef.current === loadKey) {
      return;
    }
    loadedForRef.current = loadKey;

    loadRef.current().then((ok) => {
      setFailed(!ok);
      if (!ok) {
        // Let the retry effect (or a dependency change) re-issue the load.
        loadedForRef.current = null;
      }
    });
  }, [depsKey, reloadCount]);

  useEffect(() => {
    if (!failed || reloadCount >= maxRetries) {
      return;
    }
    const timer = setTimeout(() => setReloadCount((n) => n + 1), retryDelayMs);
    return () => clearTimeout(timer);
  }, [failed, reloadCount, maxRetries, retryDelayMs]);

  return { failed };
}
