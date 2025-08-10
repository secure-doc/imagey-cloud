import { useActionIcons } from "../contexts/ActionBarContext";
import FileChooser from "../components/FileChooser";
import { useEffect, useState } from "react";
import { documentService } from "../document/DocumentService";
import Document from "../document/Document";
import { useTranslation } from "react-i18next";

interface ImagesProperties {
  user: string;
  privateKey: JsonWebKey;
}

export default function Images({ user, privateKey }: ImagesProperties) {
  const { t } = useTranslation();
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
        .loadDocuments(user, privateKey)
        .then((documents) => setDocuments(documents));
    }
  }, [privateKey, user]);
  useEffect(() => {
    if (user && selectedFiles) {
      for (const file of selectedFiles) {
        documentService
          .storeDocument(user, file, privateKey)
          .then((metadata) => {
            documentService
              .loadDocument(user, metadata, privateKey)
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
  }, [user, selectedFiles, privateKey]);
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
                    <div className="small-width small-height">
                      {t("Error loading {{name}}", { name: document.name })}
                    </div>
                  );
                }
              })}
      </div>
    </main>
  );
}
