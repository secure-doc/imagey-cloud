import { useTranslation } from "react-i18next";
import Panel from "../components/Panel";
import UploadButton from "../components/UploadButton";

import { useDocumentsId, useSettingsKey } from "../contexts/SettingsContext";
import { useEffect, useState } from "react";
import { documentService, StoreResult } from "../document/DocumentService";
import { useUser } from "../contexts/AuthenticationContext";
import Document from "../document/Document";
import { FolderMetadata } from "../document/DocumentMetadata";

export default function UploadPanel({
  className,
  onUploadComplete,
}: {
  className?: string;
  onUploadComplete?: (result: StoreResult) => void;
}) {
  const { t } = useTranslation();
  const user = useUser();
  const settingsKey = useSettingsKey();
  const documentsId = useDocumentsId();
  const [rootFolder, setRootFolder] = useState<Document<FolderMetadata>>();
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    documentService
      .loadDocument(user, documentsId, user, settingsKey)
      .then((document) => {
        if (document.type !== "folder") {
          console.error(`Expected a folder document, got ${document.type}`);
          setLoadError(true);
          return;
        }
        setRootFolder(document);
      })
      .catch((e) => {
        console.error("Failed to load the root folder", e);
        setLoadError(true);
      });
  }, [user, settingsKey, documentsId]);
  if (loadError) {
    return <>{t("Could not load your images. Retrying...")}</>;
  }
  if (!rootFolder) {
    return <>{t("Loading...")}</>;
  }
  return (
    <Panel
      className={className}
      title={t("Upload Images")}
      image={
        <div className="row center-align padding">
          <UploadButton
            className="circle extra"
            multiple
            onUploadComplete={onUploadComplete}
            folder={rootFolder}
          >
            <i>upload</i>
          </UploadButton>
        </div>
      }
    >
      <p className="center-align">
        {t("Click the upload button above to upload your first image.")}
      </p>
    </Panel>
  );
}
