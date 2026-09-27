import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router";
import { useBackButton, useTitle } from "../contexts/ActionBarContext";
import { ImageInfo, useDetailInfo } from "../contexts/DetailContext";
import Document from "../document/Document";
import { documentService } from "../document/DocumentService";
import { useDownloadAction } from "../hooks/useDownloadAction";
import { useImageBlob } from "../hooks/useImageBlob";
import {
  useDetailBackPath,
  useResolvedDetail,
} from "../hooks/useResolvedDetail";

// The detail view of one image (the medium image, not the original). The
// caller registers what it already knows in the DetailContext; after a
// reload or deep link the registry is empty and the document is resolved
// again from the `folder` or `chat` (+ `owner`) query parameter, which only
// carry ids.
export default function Image() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const folder = params.get("folder");
  const chat = params.get("chat");
  useBackButton(useDetailBackPath(folder, chat));

  const registered = useDetailInfo(id, "image");
  const { info, failed } = useResolvedDetail(
    id,
    registered,
    folder,
    chat,
    params.get("owner"),
    toImageInfo,
  );
  useTitle(info?.name);

  if (info) {
    return <ImageView key={info.documentId} info={info} />;
  }
  return (
    <main>
      {failed ? (
        <p>{t("No image found")}</p>
      ) : (
        <progress className="circle"></progress>
      )}
    </main>
  );
}

const toImageInfo = (
  doc: Document,
  accessPath: string | undefined,
  fromChat: boolean,
): ImageInfo | undefined =>
  doc.type === "image"
    ? {
        kind: "image",
        documentId: doc.documentId,
        name: doc.name,
        owner: doc.owner,
        documentKey: doc.key,
        mediumImageId: doc.mediumImageId,
        smallImageId: fromChat ? doc.smallImageId : undefined,
        mimeType: doc.mimeType,
        contentId: doc.contentId,
        accessPath,
      }
    : undefined;

const imageStyle = {
  objectFit: "contain",
  width: "100%",
  height: "calc(100vh - 64px)",
} as const;

function useFileBlob(info: ImageInfo, fileId: string) {
  return useImageBlob(
    () =>
      documentService.loadFileContent(
        info.owner,
        info.documentId,
        fileId,
        info.documentKey,
        info.accessPath,
      ),
    info.mimeType,
    [info.documentId, fileId, info.owner, info.accessPath],
  );
}

// Loads the original's contentId when it isn't already known (opened from a
// folder, whose FolderEntry carries no contentId) - decrypts with the
// document key already in hand, so this costs one metadata request and no
// key request.
async function loadContentId(info: ImageInfo): Promise<string> {
  const doc = await documentService.loadDocumentWithKey(
    info.owner,
    info.documentId,
    info.documentKey,
    info.accessPath,
  );
  if (doc.type !== "image") {
    throw new Error(`Expected an image document, got ${doc.type}`);
  }
  return doc.contentId;
}

function ImageView({ info }: { info: ImageInfo }) {
  const { t } = useTranslation();
  const { objectUrl, error } = useFileBlob(info, info.mediumImageId);

  // The download action loads the ORIGINAL (not the displayed medium
  // preview) only once clicked - it's a multiple of the preview's size and
  // rarely needed, so it's never pre-loaded.
  const downloadTarget = useMemo(
    () => ({
      name: info.name,
      mimeType: info.mimeType,
      load: async () => {
        const contentId = info.contentId ?? (await loadContentId(info));
        return documentService.loadFileContent(
          info.owner,
          info.documentId,
          contentId,
          info.documentKey,
          info.accessPath,
        );
      },
    }),
    [info],
  );
  const downloadElement = useDownloadAction(downloadTarget);

  return (
    <main
      className="center-align middle-align"
      style={{ background: "black", padding: 0 }}
    >
      {downloadElement}
      {objectUrl ? (
        <img src={objectUrl} alt={info.name} style={imageStyle} />
      ) : error ? (
        <div className="padding" style={{ color: "white" }}>
          <i className="error-text">error</i>
          <div>{t("Error loading {{name}}", { name: info.name })}</div>
        </div>
      ) : info.smallImageId ? (
        <Placeholder info={info} smallImageId={info.smallImageId} />
      ) : (
        <progress className="circle"></progress>
      )}
    </main>
  );
}

// The small image (known from the chat) shown until the medium one is loaded.
function Placeholder({
  info,
  smallImageId,
}: {
  info: ImageInfo;
  smallImageId: string;
}) {
  const { objectUrl } = useFileBlob(info, smallImageId);
  return objectUrl ? (
    <img src={objectUrl} alt={info.name} style={imageStyle} />
  ) : (
    <progress className="circle"></progress>
  );
}
