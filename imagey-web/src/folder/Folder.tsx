import { useCallback, useEffect, useState } from "react";
import { documentService, StoreResult } from "../document/DocumentService";
import { servicesFor } from "../api/servicesFor";
import ShareFolderDialog from "../components/ShareFolderDialog";
import { ShareFolderResult } from "./FolderShareService";
import { useUser } from "../contexts/AuthenticationContext";
import { useFolderIcons } from "./hooks";
import { useTranslation } from "react-i18next";
import ImageList from "../components/ImageList";
import { useContext } from "react";
import {
  FolderContext,
  useAccessPath,
  useChildAccessPath,
  useKey,
  useParentFolderId,
} from "../contexts/FolderContext";
import { useNavigate } from "react-router";
import CreateFolderDialog from "../components/CreateFolderDialog";
import Document from "../document/Document";
import { FolderEntry, FolderMetadata } from "../document/DocumentMetadata";
import Panel from "../components/Panel";
import UploadButton from "../components/UploadButton";
import { DetailContext } from "../contexts/DetailContext";
import { useOpenDocument } from "../hooks/useOpenDocument";
import { isPlayableMedia } from "../document/mediaTypes";

export default function Folder({ id }: { id: string }) {
  const { t } = useTranslation();
  const [folder, setFolder] = useState<Document<FolderMetadata> | undefined>();
  const [loadError, setLoadError] = useState(false);

  // When navigating to a different folder, `id` changes but `folder` still
  // holds the PREVIOUS folder's data for one render (the load effect below
  // only resets it once its async loadDocument() resolves). Resetting
  // synchronously during render (rather than in an effect) clears the stale
  // state before anything can render it paired with the new `id`.
  const [loadedForId, setLoadedForId] = useState(id);
  if (id !== loadedForId) {
    setLoadedForId(id);
    setFolder(undefined);
    setLoadError(false);
  }

  const user = useUser();
  const parentId = useParentFolderId(id);
  const parentKey = useKey(parentId);
  const key = useKey(id);
  const { folders, registerParentFolder, registerKey, registerFolder } =
    useContext(FolderContext);
  // Set for a folder of another user's tree (shared with us, or below such a folder): it is
  // read with the key and owner told by the folder it was reached from, not through our own
  // key chain.
  const shared = folders[id]?.owner;
  // Only a shared folder's key is told by the registry; an own folder registers the key it
  // loaded itself, which must not trigger a reload.
  const sharedKey = shared ? folders[id]?.key : undefined;
  const sharedOrigin = folders[id]?.origin;
  const sharedContributions = folders[id]?.contributions ?? false;
  const { registerDetail } = useContext(DetailContext);
  const navigate = useNavigate();
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showShare, setShowShare] = useState(false);
  // The entries of the folder are read with their own Access-Path (the child, then the folder).
  const childAccessPath = useChildAccessPath(id, folder?.owner ?? "");
  const accessPathFor = useCallback(
    (entry: FolderEntry) => childAccessPath(entry.documentId, entry.owner),
    [childAccessPath],
  );
  // Known before the folder is loaded, as it is needed to load it.
  const loadAccessPath = useAccessPath(id, shared ?? "");

  // A child (document or sub-folder) was just added to this folder. Reflect
  // it in the in-memory `folder` object: its `documents` array and
  // `revision` are the read-modify-write base for the *next* child added
  // here, so a stale copy is exactly what made the first upload vanish when
  // a folder was created right after it. `parentFolderDocuments` is the
  // list the write actually persisted (authoritative - it also carries any
  // sibling that a concurrent-change retry merged in), so we adopt it
  // rather than appending.
  const handleChildAdded = useCallback((result: StoreResult) => {
    setFolder((prev) =>
      prev
        ? {
            ...prev,
            documents: result.parentFolderDocuments,
            revision: result.parentFolderRevision ?? prev.revision,
          }
        : prev,
    );
  }, []);
  const handleCreateFolder = useCallback(() => setShowCreateFolder(true), []);

  const handleImageClick = useCallback(
    async (entry: FolderEntry) => {
      if (!folder || !entry.mediumImageId) {
        return;
      }
      const accessPath = accessPathFor(entry);
      let documentKey: JsonWebKey;
      try {
        documentKey = await documentService.loadFolderEntryKey(
          entry,
          folder.key,
        );
      } catch (e) {
        console.error(`Could not open image ${entry.documentId}`, e);
        return;
      }
      registerDetail({
        kind: "image",
        documentId: entry.documentId,
        name: entry.name,
        owner: entry.owner ?? folder.owner,
        documentKey,
        mediumImageId: entry.mediumImageId,
        mimeType: entry.mimeType,
        accessPath,
        origin: folder.origin,
      });
      navigate(`/images/${entry.documentId}?folder=${id}`);
    },
    [folder, accessPathFor, registerDetail, navigate, id],
  );

  const { open: openFile, element: openFileElement } = useOpenDocument();
  const handleFileClick = useCallback(
    async (entry: FolderEntry) => {
      if (!folder) {
        return;
      }
      const accessPath = accessPathFor(entry);
      if (isPlayableMedia(entry.mimeType) && shared) {
        // A shared folder is not part of our own tree, which the media page would resolve the
        // document in after a reload - so everything it needs is registered up front.
        const documentKey = await documentService.loadFolderEntryKey(
          entry,
          folder.key,
        );
        const doc = await servicesFor(
          folder.origin,
        ).documents.loadDocumentWithKey(
          entry.owner ?? folder.owner,
          entry.documentId,
          documentKey,
          accessPath,
        );
        if (doc.type === "file") {
          registerDetail({
            kind: "media",
            documentId: doc.documentId,
            name: doc.name,
            owner: doc.owner,
            documentKey,
            mimeType: doc.mimeType,
            contentId: doc.contentId,
            size: doc.size,
            accessPath,
            origin: folder.origin,
          });
          navigate(`/media/${entry.documentId}?folder=${id}`);
        }
        return;
      }
      if (isPlayableMedia(entry.mimeType)) {
        // Not registered via registerDetail (unlike handleImageClick above):
        // a FolderEntry carries neither contentId nor size, which the media
        // page needs, so it always resolves itself via useResolvedDetail
        // regardless - the key/metadata request this navigation skips
        // happens there instead. Safe because a folder is always the
        // current user's own.
        navigate(`/media/${entry.documentId}?folder=${id}`);
        return;
      }
      await openFile(entry.name, entry.mimeType, async () => {
        // The key is unwrapped locally from the folder's own key (like
        // handleImageClick above), so loadDocumentWithKey needs only a
        // metadata request - no separate key request.
        const documentKey = await documentService.loadFolderEntryKey(
          entry,
          folder.key,
        );
        const doc = await servicesFor(
          folder.origin,
        ).documents.loadDocumentWithKey(
          entry.owner ?? folder.owner,
          entry.documentId,
          documentKey,
          accessPath,
        );
        if (doc.type !== "file") {
          throw new Error(`Expected a file document, got ${doc.type}`);
        }
        return servicesFor(folder.origin).documents.loadFileContent(
          doc.owner,
          doc.documentId,
          doc.contentId,
          doc.key,
          accessPath,
        );
      });
    },
    [folder, id, accessPathFor, openFile, navigate, shared, registerDetail],
  );

  // The owner's record of a share (and the new revision) after a successful share.
  const handleShared = useCallback((result: ShareFolderResult) => {
    setFolder((prev) =>
      prev
        ? {
            ...prev,
            sharedWith: result.sharedWith,
            revision: result.revision ?? prev.revision,
          }
        : prev,
    );
  }, []);
  const handleShareFolder = useCallback(() => setShowShare(true), []);

  // Our own folders always take contributions; so does the folder of somebody else in our tree
  // only as long as its owner says so.
  const canAdd = !shared || sharedContributions;
  const contributionsDenied = !!folders[id]?.contributionsDenied;
  useEffect(() => {
    if (contributionsDenied) {
      const timer = setTimeout(
        () => registerFolder(id, { contributionsDenied: false }),
        6000,
      );
      return () => clearTimeout(timer);
    }
  }, [contributionsDenied, id, registerFolder]);
  const deniedElement = contributionsDenied ? (
    <div className="snackbar error active">
      {t("You can no longer add anything to this folder.")}
    </div>
  ) : null;
  useFolderIcons(id, folder, handleCreateFolder, handleChildAdded, {
    onShareFolder: handleShareFolder,
    canAdd,
    shared: !!shared,
  });

  useEffect(() => {
    if (shared) {
      if (!sharedKey) {
        return;
      }
      servicesFor(sharedOrigin)
        .documents.loadDocumentWithKey(shared, id, sharedKey, loadAccessPath)
        .then((document) => {
          if (document.type !== "folder") {
            console.error(`Expected a folder document, got ${document.type}`);
            setLoadError(true);
            return;
          }
          setFolder(document);
        })
        .catch(() => setLoadError(true));
      return;
    }
    if (!parentKey) {
      return;
    }
    documentService
      .loadDocument(user, id, parentId, parentKey)
      .then((document) => {
        if (document.type !== "folder") {
          console.error(`Expected a folder document, got ${document.type}`);
          setLoadError(true);
          return;
        }
        setFolder(document);
        registerKey(id, document.key);
      })
      .catch(() => {
        // A failed load is a look-alike empty document. Rendering it as an
        // empty folder would invite an upload that then overwrites the real
        // (still on the server) contents with a one-item list - show an
        // error and let the user retry instead.
        setLoadError(true);
      });
  }, [
    user,
    id,
    parentId,
    parentKey,
    registerKey,
    shared,
    sharedKey,
    sharedOrigin,
    loadAccessPath,
  ]);

  if (loadError) {
    return (
      <main>
        <div className="column scroll">{t("Could not load this folder.")}</div>
      </main>
    );
  }
  if (!folder) {
    return (
      <main>
        <div className="column scroll">{t("Loading images")}</div>
      </main>
    );
  }
  if (folder.documents.length === 0 && !canAdd) {
    return (
      <main>
        {deniedElement}
        <div className="column scroll">{t("This folder is empty.")}</div>
      </main>
    );
  }
  if (folder.documents.length === 0) {
    return (
      <main>
        {deniedElement}
        {showCreateFolder && (
          <CreateFolderDialog
            parentFolder={folder}
            parentFolderKey={key}
            onClose={() => setShowCreateFolder(false)}
            onCreated={handleChildAdded}
          />
        )}
        {showShare && (
          <ShareFolderDialog
            folder={folder}
            onClose={() => setShowShare(false)}
            onShared={handleShared}
          />
        )}
        <div className="column scroll">
          <Panel
            className="s12 m6 l4"
            title={t("Upload Images")}
            image={
              <div className="row center-align padding">
                {folder && (
                  <UploadButton
                    className="circle extra"
                    multiple
                    folder={folder}
                    onUploadComplete={handleChildAdded}
                  >
                    <i>upload</i>
                  </UploadButton>
                )}
              </div>
            }
          >
            <p className="center-align">
              {t("Click the upload button above to upload your first image.")}
            </p>
          </Panel>
        </div>
      </main>
    );
  }
  return (
    <main>
      {deniedElement}
      {showCreateFolder && (
        <CreateFolderDialog
          parentFolder={folder}
          parentFolderKey={key}
          onClose={() => setShowCreateFolder(false)}
          onCreated={handleChildAdded}
        />
      )}
      {showShare && (
        <ShareFolderDialog
          folder={folder}
          onClose={() => setShowShare(false)}
          onShared={handleShared}
        />
      )}
      {openFileElement}
      <div className="column scroll">
        <ImageList
          entries={folder.documents}
          folderOwner={folder.owner}
          folderOrigin={folder.origin}
          folderKey={folder.key}
          accessPathFor={accessPathFor}
          onImageClick={handleImageClick}
          onFileClick={handleFileClick}
          onFolderClick={async (entry) => {
            registerParentFolder(entry.documentId, id);
            const childOwner = entry.owner ?? folder.owner;
            if (shared || childOwner !== user) {
              // The key of a folder of another tree (shared with us, or contributed to ours) is
              // unwrapped from its entry here, it cannot be derived from our own key chain.
              registerFolder(entry.documentId, {
                key: await documentService.loadFolderEntryKey(
                  entry,
                  folder.key,
                ),
                owner: childOwner,
                origin: folder.origin,
                contributions: shared ? sharedContributions : true,
              });
            }
            navigate("/documents/" + entry.documentId);
          }}
        />
      </div>
    </main>
  );
}
