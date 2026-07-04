import { useActionIcons } from "../contexts/ActionBarContext";
import UploadButton from "../components/UploadButton";
import { useEffect, useState, useMemo } from "react";
import { documentService } from "../document/DocumentService";
import DocumentMetadata from "../document/DocumentMetadata";
import { useTranslation } from "react-i18next";
import { useAuthentication } from "../contexts/AuthenticationContext";
import ImageList from "../components/ImageList";
import UploadPanel from "../activity/UploadPanel";
import CreateFolderDialog from "../components/CreateFolderDialog";

export default function Images() {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const mainKeyPair = authentication.keyPairs.mainKeyPair;
  const publicMainKey = mainKeyPair?.publicKey;
  const privateMainKey = mainKeyPair?.privateKey;

  const [documents, setDocuments] = useState<DocumentMetadata[]>();
  const [folderPath, setFolderPath] = useState<
    import("../document/Document").default[]
  >([]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);

  const currentFolder =
    folderPath.length > 0 ? folderPath[folderPath.length - 1] : undefined;

  const actionIcons = useMemo(() => {
    const icons = [];
    if (currentFolder) {
      icons.push(
        <button
          key="back"
          className="circle transparent"
          onClick={() => setFolderPath((p) => p.slice(0, -1))}
        >
          <i>arrow_back</i>
        </button>,
      );
    }

    icons.push(
      <button
        key="add-menu"
        aria-label="add-menu"
        className="circle transparent"
      >
        <i>add</i>
        <menu className="no-wrap left">
          <li>
            <UploadButton
              className="transparent"
              multiple
              asMenuItem
              parentFolderId={currentFolder?.documentId}
              parentFolderKey={currentFolder?.key}
              onUploadComplete={(document) =>
                setDocuments((previousDocuments) =>
                  previousDocuments
                    ? [...previousDocuments, document]
                    : [document],
                )
              }
            >
              {t("Upload Document")}
            </UploadButton>
          </li>
          <li>
            <a onClick={() => setShowCreateFolder(true)}>
              {t("Create Folder")}
            </a>
          </li>
        </menu>
      </button>,
    );
    return icons;
  }, [currentFolder, setFolderPath, setShowCreateFolder, t, setDocuments]);

  useActionIcons(actionIcons);

  useEffect(() => {
    if (user && publicMainKey && privateMainKey) {
      setDocuments(undefined);
      documentService
        .loadDocuments(
          user,
          publicMainKey,
          privateMainKey,
          currentFolder?.documentId,
          currentFolder?.key,
        )
        .then((documents) => setDocuments(documents));
    }
  }, [publicMainKey, privateMainKey, user, currentFolder]);

  const folderDocIds = useMemo(() => {
    if (!currentFolder || !currentFolder.documents) return null;
    return currentFolder.documents;
  }, [currentFolder]);

  const sortedDocuments = useMemo(() => {
    if (!documents) return documents;
    if (folderDocIds) {
      const map = new Map<string, number>();
      folderDocIds.forEach((id, index) => map.set(id, index));
      return [...documents].sort((a, b) => {
        const indexA = map.has(a.documentId)
          ? map.get(a.documentId)!
          : Infinity;
        const indexB = map.has(b.documentId)
          ? map.get(b.documentId)!
          : Infinity;
        return indexA - indexB;
      });
    }
    return documents;
  }, [documents, folderDocIds]);

  return (
    <main>
      {showCreateFolder && (
        <CreateFolderDialog
          parentFolderId={currentFolder?.documentId}
          parentFolderKey={currentFolder?.key}
          onClose={() => setShowCreateFolder(false)}
          onCreated={(folder) => {
            setDocuments((prev) => (prev ? [...prev, folder] : [folder]));
          }}
        />
      )}
      <div className="column scroll">
        {!sortedDocuments ? (
          t("Loading images")
        ) : sortedDocuments.length === 0 ? (
          <UploadPanel
            parentFolderId={currentFolder?.documentId}
            parentFolderKey={currentFolder?.key}
            onUploadComplete={(document) =>
              setDocuments((previousDocuments) =>
                previousDocuments
                  ? [...previousDocuments, document]
                  : [document],
              )
            }
          />
        ) : (
          <ImageList
            documents={sortedDocuments}
            onFolderClick={(metadata) => {
              if (user && publicMainKey && privateMainKey) {
                documentService
                  .loadDocumentContent(
                    user,
                    metadata,
                    publicMainKey,
                    privateMainKey,
                    metadata.sharedKey,
                    currentFolder?.key,
                  )
                  .then((folderDoc) => {
                    setFolderPath((p) => [...p, folderDoc]);
                  })
                  .catch(console.error);
              }
            }}
          />
        )}
      </div>
    </main>
  );
}
