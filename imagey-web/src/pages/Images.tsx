import { useActionIcons } from "../contexts/ActionBarContext";
import UploadButton from "../components/UploadButton";
import { useEffect, useState, useMemo } from "react";
import { documentService } from "../document/DocumentService";
import Document from "../document/Document";
import { useTranslation } from "react-i18next";
import { useAuthentication } from "../contexts/AuthenticationContext";
import ImageComponent from "../components/ImageComponent";
import UploadPanel from "../activity/UploadPanel";
import CreateFolderButton from "../components/CreateFolderButton";
import FolderComponent from "../components/FolderComponent";

export default function Images() {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const mainKeyPair = authentication.keyPairs.mainKeyPair;
  const publicMainKey = mainKeyPair.publicKey;
  const privateMainKey = mainKeyPair.privateKey;
  const [documents, setDocuments] = useState<Document[]>();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const actionIcons = useMemo(
    () => [
      <CreateFolderButton
        key="create-folder"
        onFolderCreated={(folder) =>
          setDocuments((previousDocuments) =>
            previousDocuments ? [...previousDocuments, folder] : [folder],
          )
        }
      />,
      <UploadButton
        key="add-image"
        aria-label="add-image"
        multiple
        onUploadComplete={(document) =>
          setDocuments((previousDocuments) =>
            previousDocuments ? [...previousDocuments, document] : [document],
          )
        }
      />,
    ],
    [setDocuments],
  );
  useActionIcons(actionIcons);
  useEffect(() => {
    if (user) {
      documentService
        .loadDocuments(user, publicMainKey, privateMainKey)
        .then((documents) => setDocuments(documents));
    }
  }, [publicMainKey, privateMainKey, user]);

  const handleDropDocument = async (folderId: string, documentId: string) => {
    if (!user) return;
    try {
      const folder = documents?.find(d => d.documentId === folderId);
      const doc = documents?.find(d => d.documentId === documentId);
      if (folder && doc) {
        await documentService.addDocumentToFolder(
          user,
          doc,
          folder,
          publicMainKey,
          privateMainKey
        );
        // Reload documents to update the view
        const docs = await documentService.loadDocuments(user, publicMainKey, privateMainKey);
        setDocuments(docs);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const currentFolder = currentFolderId
    ? documents?.find((d) => d.documentId === currentFolderId)
    : null;
  const folders = documents?.filter((d) => d.type === "folder") || [];
  const images = documents?.filter((d) => d.type !== "folder") || [];

  const visibleFolders = folders.filter((f) =>
    currentFolderId === null
      ? !f.folderIds || f.folderIds.length === 0
      : f.folderIds?.includes(currentFolderId),
  );
  const visibleImages = images.filter((img) =>
    currentFolderId === null
      ? !img.folderIds || img.folderIds.length === 0
      : img.folderIds?.includes(currentFolderId),
  );

  return (
    <main>
      <div className="column scroll">
        {!documents ? (
          t("Loading images")
        ) : documents.length === 0 ? (
          <UploadPanel
            onUploadComplete={(document) =>
              setDocuments((previousDocuments) =>
                previousDocuments
                  ? [...previousDocuments, document]
                  : [document],
              )
            }
          />
        ) : (
          <>
            {currentFolderId && (
              <div
                style={{
                  padding: "10px",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <button onClick={() => setCurrentFolderId(null)}>
                  ← {t("Back")}
                </button>
                <h2>{currentFolder?.name}</h2>
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", width: "100%" }}>
              {visibleFolders.map((folder) => (
                <FolderComponent
                  key={folder.documentId}
                  folder={folder}
                  onClick={setCurrentFolderId}
                  onDropDocument={handleDropDocument}
                />
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", width: "100%" }}>
              {visibleImages.map((document) => (
                <ImageComponent key={document.documentId} image={document} />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
