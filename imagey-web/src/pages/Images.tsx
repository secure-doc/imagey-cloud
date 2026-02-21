import { useActionIcons } from "../contexts/ActionBarContext";
import FileChooser from "../components/FileChooser";
import { useEffect, useState } from "react";
import { documentService } from "../document/DocumentService";
import Document from "../document/Document";
import { useTranslation } from "react-i18next";
import { useAuthentication } from "../contexts/AuthenticationContext";

export default function Images() {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const mainKeyPair = authentication.keyPairs.mainKeyPair;
  const publicMainKey = mainKeyPair.publicKey;
  const privateMainKey = mainKeyPair.privateKey;
  const [selectedFiles, setSelectedFiles] = useState<FileList | undefined>(
    undefined,
  );
  const [documents, setDocuments] = useState<Document[]>();
  const actionIcons = [
    <FileChooser
      key="add-image"
      multiple
      onFilesSelected={(files) => setSelectedFiles(files)}
    />,
  ];
  useActionIcons(actionIcons);
  useEffect(() => {
    if (user) {
      documentService
        .loadDocuments(user, publicMainKey, privateMainKey)
        .then((documents) => setDocuments(documents));
    }
  }, [publicMainKey, privateMainKey, user]);
  useEffect(() => {
    if (user && selectedFiles) {
      for (const file of selectedFiles) {
        documentService
          .storeDocument(user, file, publicMainKey, privateMainKey)
          .then((metadata) => {
            documentService
              .loadDocument(user, metadata, publicMainKey, privateMainKey)
              .then((document) =>
                setDocuments((previousDocuments) =>
                  previousDocuments
                    ? [...previousDocuments, document]
                    : [document],
                ),
              );
          });
      }
      setSelectedFiles(undefined);
    }
  }, [user, selectedFiles, publicMainKey, privateMainKey]);
  return (
    <main>
      <div className="column scroll">
        {!documents
          ? t("Loading images")
          : documents.length === 0
            ? t("No images found")
            : documents.map((document) => {
                const content = document.content;
                if (content) {
                  const blob = new Blob([content]);
                  const url = URL.createObjectURL(blob);
                  return (
                    <img
                      key={document.documentId}
                      src={url}
                      alt={document.name}
                      loading="lazy"
                      className="small-width small-height"
                    />
                  );
                } else {
                  return (
                    <div
                      key={document.documentId}
                      className="small-width small-height"
                    >
                      {t("Error loading {{name}}", { name: document.name })}
                    </div>
                  );
                }
              })}
      </div>
    </main>
  );
}
