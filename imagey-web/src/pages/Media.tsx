import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router";
import { useBackButton, useTitle } from "../contexts/ActionBarContext";
import { MediaInfo, useDetailInfo } from "../contexts/DetailContext";
import Document from "../document/Document";
import { documentService } from "../document/DocumentService";
import {
  useDetailBackPath,
  useResolvedDetail,
} from "../hooks/useResolvedDetail";
import { useDownloadAction } from "../hooks/useDownloadAction";
import { useObjectUrl } from "../hooks/useObjectUrl";
import { useOpenDocument } from "../hooks/useOpenDocument";

// AES-GCM doesn't decrypt incrementally - the encrypted buffer, the
// plaintext and the Blob all sit in memory at once - so a very large file
// isn't loaded at all; the user downloads/shares it instead (see the
// "too large" branch of MediaView below).
export const MAX_INLINE_MEDIA_BYTES = 250 * 1024 * 1024;

export function isPlayableMedia(mimeType: string | undefined): boolean {
  return (
    !!mimeType &&
    (mimeType.startsWith("audio/") || mimeType.startsWith("video/"))
  );
}

const toMediaInfo = (
  doc: Document,
  accessPath: string | undefined,
): MediaInfo | undefined =>
  doc.type === "file" && isPlayableMedia(doc.mimeType)
    ? {
        kind: "media",
        documentId: doc.documentId,
        name: doc.name,
        owner: doc.owner,
        documentKey: doc.key,
        mimeType: doc.mimeType,
        contentId: doc.contentId,
        size: doc.size,
        accessPath,
      }
    : undefined;

// The detail view of an audio/video document, analogous to pages/Image.tsx.
// The caller registers what it already knows in the DetailContext; after a
// reload or deep link the registry is empty and the document is resolved
// again from the `folder` or `chat` (+ `owner`) query parameter.
export default function Media() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const folder = params.get("folder");
  const chat = params.get("chat");
  useBackButton(useDetailBackPath(folder, chat));

  const registered = useDetailInfo(id, "media");
  const { info, failed } = useResolvedDetail(
    id,
    registered,
    folder,
    chat,
    params.get("owner"),
    toMediaInfo,
  );
  useTitle(info?.name);

  if (info) {
    return <MediaView key={info.documentId} info={info} />;
  }
  return (
    <main>
      {failed ? (
        <p>{t("No file found")}</p>
      ) : (
        <progress className="circle"></progress>
      )}
    </main>
  );
}

const mediaStyle = {
  width: "100%",
  height: "calc(100vh - 64px)",
} as const;

// Security guardrails (see docs/plans/open-documents.md "Warum Audio/Video
// in der App unbedenklich ist"): this renders ONLY <audio>/<video> - never
// <iframe>/<object>/<embed>/<img> for a non-image document. Which element is
// rendered, and the Blob's type, both come only from isPlayableMedia's
// audio/video prefix check on the uploader-supplied (untrusted) mimeType - a
// media element that fails to decode its content just fires `error`, it
// never executes script or renders markup. No <track> from document
// content. `controlsList="nodownload"` hides the native per-element
// download entry (Chromium only); the app-bar download action below
// replaces it with the original filename instead of a random content id.
function MediaView({ info }: { info: MediaInfo }) {
  const { t } = useTranslation();
  const [content, setContent] = useState<ArrayBuffer>();
  const [loadError, setLoadError] = useState(false);
  const [unplayable, setUnplayable] = useState(false);
  const { open, element } = useOpenDocument();

  const tooLarge = info.size > MAX_INLINE_MEDIA_BYTES;

  useEffect(() => {
    if (tooLarge) {
      return;
    }
    let cancelled = false;
    documentService
      .loadFileContent(
        info.owner,
        info.documentId,
        info.contentId,
        info.documentKey,
        info.accessPath,
      )
      .then((c) => !cancelled && setContent(c))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [info, tooLarge]);

  const blob = useMemo(
    () => (content ? new Blob([content], { type: info.mimeType }) : undefined),
    [content, info.mimeType],
  );
  const objectUrl = useObjectUrl(blob);

  // The content is already in memory once loaded (unplayable fallback) -
  // reused instead of reloading it, so the user gesture behind the click
  // stays valid for navigator.share. Before that (too-large fallback) it's
  // loaded on demand, the same way the folder/chat file tiles do.
  const loadForDownload = () =>
    content
      ? Promise.resolve(content)
      : documentService.loadFileContent(
          info.owner,
          info.documentId,
          info.contentId,
          info.documentKey,
          info.accessPath,
        );
  const handleFallbackDownload = () =>
    open(info.name, info.mimeType, loadForDownload);

  const downloadTarget = useMemo(
    () =>
      content
        ? {
            name: info.name,
            mimeType: info.mimeType,
            load: () => Promise.resolve(content),
          }
        : undefined,
    [content, info.name, info.mimeType],
  );
  const downloadElement = useDownloadAction(downloadTarget);

  return (
    <main
      className="center-align middle-align"
      style={{ background: "black", padding: 0 }}
    >
      {element}
      {downloadElement}
      {tooLarge ? (
        <div className="padding" style={{ color: "white" }}>
          <div>{t("{{name}} is too large to play", { name: info.name })}</div>
          <button onClick={handleFallbackDownload}>{t("Download")}</button>
        </div>
      ) : loadError ? (
        <div className="padding" style={{ color: "white" }}>
          <i className="error-text">error</i>
          <div>{t("Error loading {{name}}", { name: info.name })}</div>
        </div>
      ) : unplayable ? (
        <div className="padding" style={{ color: "white" }}>
          <div>
            {t("{{name}} cannot be played in the browser", { name: info.name })}
          </div>
          <button onClick={handleFallbackDownload}>{t("Download")}</button>
        </div>
      ) : objectUrl ? (
        info.mimeType.startsWith("video/") ? (
          <video
            src={objectUrl}
            controls
            playsInline
            controlsList="nodownload"
            style={mediaStyle}
            onError={() => setUnplayable(true)}
          />
        ) : (
          <audio
            src={objectUrl}
            controls
            controlsList="nodownload"
            onError={() => setUnplayable(true)}
          />
        )
      ) : (
        <progress className="circle"></progress>
      )}
    </main>
  );
}
