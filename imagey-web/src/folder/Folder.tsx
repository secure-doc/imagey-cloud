import { useEffect, useState } from "react";
import { documentService } from "../document/DocumentService";
import { useUser } from "../contexts/AuthenticationContext";
import { useFolderIcons, useSortedDocuments } from "./hooks";
import DocumentMetadata from "../document/DocumentMetadata";
import { useTranslation } from "react-i18next";
import ImageList from "../components/ImageList";
import { useContext } from "react";
import { FolderContext, useKey, useParentFolderId } from "../contexts/FolderContext";
import { useNavigate } from "react-router";
import CreateFolderDialog from "../components/CreateFolderDialog";

export default function Folder({
  id
}: {
  id: string;
}) {
  const { t } = useTranslation();
  const [documentIds, setDocumentIds] = useState<string[]>();
  const [documents, setDocuments] = useState<DocumentMetadata[]>();
  const user = useUser();
  const parentId = useParentFolderId(id);
  const parentKey = useKey(parentId);
  const key = useKey(id);
  const { registerParentFolder, registerKey } = useContext(FolderContext);
  const navigate = useNavigate();
  const [showCreateFolder, setShowCreateFolder] = useState(false);

  useFolderIcons(id, key, () => {}, () => {});

  useEffect(() => {
	if (!parentKey) {
		return;
	}
    documentService
      .loadDocument(user, id, parentId, parentKey)
      .then((document) => {
        if (document.key) {
          registerKey(id, document.key);
        }
		console.log("Loaded " + JSON.stringify(document))
        setDocumentIds(document.documents);
      });
  }, [user, id, parentId, parentKey, registerKey]);
  useEffect(() => {
    if (documentIds && key) {
      Promise.all(
        documentIds.map((documentId) =>
          documentService.loadDocument(user, documentId, id, key),
        ),
      ).then((documents) => setDocuments(documents));
    }
  }, [id, user, documentIds, key]);
  const sortedDocuments = useSortedDocuments(documentIds, documents);
  if (!sortedDocuments) {
    return (
      <main>
        <div className="column scroll">{t("Loading images")}</div>
      </main>
    );
  }
  return (
    <main>
	{showCreateFolder && (
	  <CreateFolderDialog
	    parentFolderId={id}
	    parentFolderKey={key}
	    onClose={() => setShowCreateFolder(false)}
	    onCreated={(folder) => {
	      setDocuments((prev) => (prev ? [...prev, folder] : [folder]));
	    }}
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
