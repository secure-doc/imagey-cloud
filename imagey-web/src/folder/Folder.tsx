import { useCallback, useEffect, useState } from "react";
import { documentService, StoreResult } from "../document/DocumentService";
import { useUser } from "../contexts/AuthenticationContext";
import { useFolderIcons, useSortedDocuments } from "./hooks";
import DocumentMetadata from "../document/DocumentMetadata";
import { useTranslation } from "react-i18next";
import ImageList from "../components/ImageList";
import { useContext } from "react";
import {
  FolderContext,
  useKey,
  useParentFolderId,
} from "../contexts/FolderContext";
import { useNavigate } from "react-router";
import CreateFolderDialog from "../components/CreateFolderDialog";
import Document from "../document/Document";
import Panel from "../components/Panel";
import UploadButton from "../components/UploadButton";

export default function Folder({ id }: { id: string }) {
  const { t } = useTranslation();
  const [documentIds, setDocumentIds] = useState<string[]>();
  const [folder, setFolder] = useState<Document | undefined>();
  const [documents, setDocuments] = useState<DocumentMetadata[]>();
  const [loadError, setLoadError] = useState(false);

  // When navigating to a different folder, `id` changes but the state above
  // still holds the PREVIOUS folder's data for one render (effect1 below only
  // resets it once its async loadDocument() resolves). If the previous
  // folder's documentIds happen to include the new folder's own id (e.g. it
  // was the previous folder's only child - exactly the "navigate into a
  // freshly created empty folder" case), effect2 would fire on that stale
  // documentIds paired with the NEW id, asking to load "id" as its own child
  // with itself as parent. Resetting synchronously during render (rather
  // than in an effect) clears the stale state before any effect can observe
  // that mismatched pairing.
  const [loadedForId, setLoadedForId] = useState(id);
  if (id !== loadedForId) {
    setLoadedForId(id);
    setFolder(undefined);
    setDocumentIds(undefined);
    setDocuments(undefined);
    setLoadError(false);
  }

  const user = useUser();
  const parentId = useParentFolderId(id);
  const parentKey = useKey(parentId);
  const key = useKey(id);
  const { registerParentFolder, registerKey } = useContext(FolderContext);
  const navigate = useNavigate();
  const [showCreateFolder, setShowCreateFolder] = useState(false);

  // A child (document or sub-folder) was just added to this folder. Reflect it
  // in the displayed list AND in the in-memory `folder` object: its `documents`
  // array and `etag` are the read-modify-write base for the *next* child added
  // here, so a stale copy is exactly what made the first upload vanish when a
  // folder was created right after it. `parentFolderDocuments` is the list the
  // write actually persisted (authoritative - it also carries any sibling that
  // a concurrent-change retry merged in), so we adopt it rather than appending.
  const handleChildAdded = useCallback((result: StoreResult) => {
    setDocuments((prev) =>
      prev ? [...prev, result.document] : [result.document],
    );
    setFolder((prev) =>
      prev
        ? {
            ...prev,
            documents: result.parentFolderDocuments,
            etag: result.parentFolderETag ?? prev.etag,
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
        // A failed load is a look-alike empty document. Rendering it as an
        // empty folder would invite an upload that then overwrites the real
        // (still on the server) contents with a one-item list - show an error
        // and let the user retry instead.
        if (document.loadFailed) {
          setLoadError(true);
          return;
        }
        setFolder(document);
        if (document.key) {
          registerKey(id, document.key);
        }
        // A folder's metadata may omit `documents` entirely (a freshly created
        // folder is stored without the field). Normalize to [] so an empty
        // folder resolves to its empty state instead of hanging on "Loading
        // images" - effect2 below only runs when `documentIds` is defined.
        setDocumentIds(document.documents ?? []);
      });
  }, [user, id, parentId, parentKey, registerKey]);
  useEffect(() => {
    if (!documentIds) {
      return;
    }
    if (documentIds.length === 0) {
      setDocuments([]);
      return;
    }
    if (key) {
      Promise.all(
        documentIds.map((documentId) =>
          documentService.loadDocument(user, documentId, id, key),
        ),
      ).then((documents) => setDocuments(documents));
    }
  }, [id, user, documentIds, key]);
  const sortedDocuments = useSortedDocuments(documentIds, documents);
  if (loadError) {
    return (
      <main>
        <div className="column scroll">{t("Could not load this folder.")}</div>
      </main>
    );
  }
  if (!sortedDocuments) {
    return (
      <main>
        <div className="column scroll">{t("Loading images")}</div>
      </main>
    );
  }
  if (sortedDocuments.length === 0) {
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
          documents={sortedDocuments}
          onFolderClick={(metadata) => {
            registerParentFolder(metadata.documentId, id);
            navigate("/documents/" + metadata.documentId);
          }}
        />
      </div>
    </main>
  );
}
