import { useCallback, useEffect, useState } from "react";
import { documentService, StoreResult } from "../document/DocumentService";
import { useUser } from "../contexts/AuthenticationContext";
import { useFolderIcons } from "./hooks";
import { useTranslation } from "react-i18next";
import ImageList from "../components/ImageList";
import { useContext } from "react";
import {
  FolderContext,
  useAccessPath,
  useKey,
  useParentFolderId,
} from "../contexts/FolderContext";
import { useNavigate } from "react-router";
import CreateFolderDialog from "../components/CreateFolderDialog";
import Document from "../document/Document";
import { FolderMetadata } from "../document/DocumentMetadata";
import Panel from "../components/Panel";
import UploadButton from "../components/UploadButton";

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
  const { registerParentFolder, registerKey } = useContext(FolderContext);
  const navigate = useNavigate();
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const accessPath = useAccessPath(id, folder?.owner ?? "");

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

  useFolderIcons(id, folder, handleCreateFolder, handleChildAdded);

  useEffect(() => {
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
  }, [user, id, parentId, parentKey, registerKey]);

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
  if (folder.documents.length === 0) {
    return (
      <main>
        {showCreateFolder && (
          <CreateFolderDialog
            parentFolder={folder}
            parentFolderKey={key}
            onClose={() => setShowCreateFolder(false)}
            onCreated={handleChildAdded}
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
      {showCreateFolder && (
        <CreateFolderDialog
          parentFolder={folder}
          parentFolderKey={key}
          onClose={() => setShowCreateFolder(false)}
          onCreated={handleChildAdded}
        />
      )}
      <div className="column scroll">
        <ImageList
          entries={folder.documents}
          folderOwner={folder.owner}
          folderKey={folder.key}
          accessPath={accessPath}
          onFolderClick={(entry) => {
            registerParentFolder(entry.documentId, id);
            navigate("/documents/" + entry.documentId);
          }}
        />
      </div>
    </main>
  );
}
