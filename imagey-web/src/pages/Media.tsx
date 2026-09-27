import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router";
import { useBackButton, useTitle } from "../contexts/ActionBarContext";
import { MediaInfo, useDetailInfo } from "../contexts/DetailContext";
import Document from "../document/Document";
import { documentService } from "../document/DocumentService";
import {
  isPlayableMedia,
  MAX_INLINE_MEDIA_BYTES,
} from "../document/mediaTypes";
import {
  useDetailBackPath,
  useResolvedDetail,
} from "../hooks/useResolvedDetail";
import { useDownloadAction } from "../hooks/useDownloadAction";
import { useObjectUrl } from "../hooks/useObjectUrl";
import { useOpenDocument } from "../hooks/useOpenDocument";

// The third parameter useResolvedDetail's toInfo contract passes (fromChat)
// is intentionally unused here: toImageInfo (pages/Image.tsx) needs it to
// decide whether to keep a chat-only smallImageId placeholder, but media has
// no such preview/placeholder distinction - a MediaInfo is the same shape
// regardless of where it was resolved from.
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
// Only a clean audio/*|video/* subtype (no stray characters that could carry
// meaning elsewhere the type string is used) is passed through as-is; the
// uploader-supplied mimeType is otherwise untrusted, and isPlayableMedia's
// prefix check (in toMediaInfo, gating whether this page resolves at all)
// only constrains the prefix, not the rest of the string.
const SAFE_MEDIA_TYPE = /^(audio|video)\/[\w.+-]+$/;
function sanitizedMediaType(mimeType: string): string {
  return SAFE_MEDIA_TYPE.test(mimeType) ? mimeType : "application/octet-stream";
}

function MediaView({ info }: { info: MediaInfo }) {
  const { t } = useTranslation();
  // Only the Blob is kept - never a separate ArrayBuffer copy of the same
  // bytes. openDocument (loadForDownload/downloadTarget below) accepts a
  // Blob directly and hands it straight to `File`, so no second copy is
  // ever made from it either - doubling (tripling with an ArrayBuffer copy
  // plus the eventual download File) memory use for as long as this page is
  // open is exactly the problem MAX_INLINE_MEDIA_BYTES exists to bound.
  const [blob, setBlob] = useState<Blob>();
  const [loadError, setLoadError] = useState(false);
  const [unplayable, setUnplayable] = useState(false);
  const { open, element } = useOpenDocument();

  const tooLarge = info.size > MAX_INLINE_MEDIA_BYTES;
  const safeMimeType = sanitizedMediaType(info.mimeType);

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
      .then((c) => !cancelled && setBlob(new Blob([c], { type: safeMimeType })))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [info, tooLarge, safeMimeType]);

  const objectUrl = useObjectUrl(blob);

  // The Blob is already in memory once loaded (unplayable fallback) -
  // handed to openDocument as-is (no arrayBuffer() read, no extra copy),
  // so nothing async runs between the click and navigator.share and the
  // user gesture behind it stays valid even for a large file. Before that
  // (too-large fallback) it's loaded on demand, the same way the
  // folder/chat file tiles do.
  const loadForDownload = () =>
    blob
      ? Promise.resolve(blob)
      : documentService.loadFileContent(
          info.owner,
          info.documentId,
          info.contentId,
          info.documentKey,
          info.accessPath,
        );
  const handleFallbackDownload = () =>
    open(info.name, safeMimeType, loadForDownload);

  const downloadTarget = useMemo(
    () =>
      blob
        ? {
            name: info.name,
            mimeType: safeMimeType,
            load: () => Promise.resolve(blob),
          }
        : undefined,
    [blob, info.name, safeMimeType],
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
