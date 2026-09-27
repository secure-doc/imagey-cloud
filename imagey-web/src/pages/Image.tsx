import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router";
import { useBackButton, useTitle } from "../contexts/ActionBarContext";
import { useUser } from "../contexts/AuthenticationContext";
import {
  FolderContext,
  useAccessPath,
  useKey,
} from "../contexts/FolderContext";
import { ImageInfo, useImageInfo } from "../contexts/ImageContext";
import { useDocumentsId } from "../contexts/SettingsContext";
import { documentService } from "../document/DocumentService";
import { useChatKey } from "../hooks/useChatKey";
import { useImageBlob } from "../hooks/useImageBlob";

// The detail view of one image (the medium image, not the original). The
// caller registers what it already knows in the ImageContext; after a reload
// or deep link the registry is empty and the document is resolved again from
// the `folder` or `chat` (+ `owner`) query parameter, which only carry ids.
export default function Image() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const folder = params.get("folder");
  const chat = params.get("chat");
  const backPath = folder
    ? `/documents/${folder}`
    : chat
      ? `/chats/${chat}`
      : undefined;
  useBackButton(backPath);

  const registered = useImageInfo(id);
  const { info, failed } = useResolvedImage(
    id,
    registered,
    folder,
    chat,
    params.get("owner"),
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

function useResolvedImage(
  id: string,
  registered: ImageInfo | undefined,
  folder: string | null,
  chat: string | null,
  ownerParam: string | null,
): { info?: ImageInfo; failed: boolean } {
  const user = useUser();
  const documentsId = useDocumentsId();
  const needsResolving = !registered;
  // After a reload only the root folder's parent is known again (App.tsx); the
  // key of a sub-folder can't be derived, so its images can't be resolved.
  const { folders } = useContext(FolderContext);
  const folderUnresolvable =
    !!folder && folder !== documentsId && !folders[folder]?.parentId;

  const owner = folder ? user : (ownerParam ?? "");
  const isOwner = owner === user;

  // Both keys are resolved unconditionally (rules of hooks) and the one that
  // matches the entry point is used. Only a non-owner needs the chat key: the
  // owner reaches the document through their own root folder.
  const folderKey = useKey(folder ?? "");
  const rootFolderKey = useKey(documentsId);
  const { key: chatKey, failed: chatKeyFailed } = useChatKey(
    needsResolving && !isOwner ? chat : null,
  );

  const parentId = folder ? folder : isOwner ? documentsId : user;
  const parentKey = folder ? folderKey : isOwner ? rootFolderKey : chatKey;
  const accessPath = useAccessPath(id, owner);

  const [loaded, setLoaded] = useState<{ id: string; info?: ImageInfo }>();

  const canResolve =
    needsResolving && !folderUnresolvable && !!(folder || (chat && ownerParam));
  useEffect(() => {
    if (!canResolve || !parentKey) {
      return;
    }
    let cancelled = false;
    documentService
      .loadDocument(owner, id, parentId, parentKey, undefined, accessPath)
      .then((doc) => {
        if (cancelled) {
          return;
        }
        setLoaded({
          id,
          info:
            doc.type === "image"
              ? {
                  documentId: doc.documentId,
                  name: doc.name,
                  owner: doc.owner,
                  documentKey: doc.key,
                  mediumImageId: doc.mediumImageId,
                  smallImageId: chat ? doc.smallImageId : undefined,
                  mimeType: doc.mimeType,
                  accessPath,
                }
              : undefined,
        });
      })
      .catch(() => !cancelled && setLoaded({ id }));
    return () => {
      cancelled = true;
    };
  }, [canResolve, owner, id, parentId, parentKey, accessPath, chat]);

  if (registered) {
    return { info: registered, failed: false };
  }
  if (loaded?.id === id && loaded.info) {
    return { info: loaded.info, failed: false };
  }
  return {
    failed: !canResolve || loaded?.id === id || (!!chat && chatKeyFailed),
  };
}

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

function ImageView({ info }: { info: ImageInfo }) {
  const { t } = useTranslation();
  const { objectUrl, error } = useFileBlob(info, info.mediumImageId);

  return (
    <main
      className="center-align middle-align"
      style={{ background: "black", padding: 0 }}
    >
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
