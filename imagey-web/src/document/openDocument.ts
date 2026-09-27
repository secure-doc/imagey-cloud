// Opens a decrypted document outside the app: download on desktop, the
// system share sheet on mobile. Deliberately never `window.open`/
// `location.href` a blob URL - that would load it as a *page* in the app's
// own origin, letting a shared HTML/SVG/XML file run script with access to
// this origin's localStorage (device keys). See docs/plans/open-documents.md
// "Warum kein Blob-Tab".

export type OpenResult =
  | { result: "downloaded" | "shared" | "cancelled" }
  | { result: "needsGesture"; file: File };

export async function openDocument(
  name: string,
  mimeType: string | undefined,
  // A Blob a caller already has decrypted content for (e.g. the media
  // detail page's playback Blob) is passed straight through to `File`
  // below - no extra async read (which could let the click's user gesture
  // expire before navigator.share) or intermediate ArrayBuffer copy.
  load: () => Promise<ArrayBuffer | Blob>,
): Promise<OpenResult> {
  const content = await load();
  const file = new File([content], name, {
    type: mimeType || "application/octet-stream",
  });
  if (isMobile() && canShareFile(file)) {
    return shareFile(file);
  }
  downloadFile(file);
  return { result: "downloaded" };
}

export async function shareFile(file: File): Promise<OpenResult> {
  try {
    await navigator.share({ files: [file], title: file.name });
    return { result: "shared" };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { result: "cancelled" };
    }
    if (e instanceof DOMException && e.name === "NotAllowedError") {
      return { result: "needsGesture", file };
    }
    console.error(`Sharing ${file.name} failed, downloading instead`, e);
    downloadFile(file);
    return { result: "downloaded" };
  }
}

function isMobile() {
  return window.matchMedia("(pointer: coarse)").matches;
}

function canShareFile(file: File) {
  return (
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}

// Revoked after a delay, not immediately: some browsers only start reading
// the blob after click() has returned.
const REVOKE_DELAY_MS = 60_000;

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
