import { useTranslation } from "react-i18next";
import Panel from "../components/Panel";
import UploadButton from "../components/UploadButton";

import { useDocumentsId, useSettingsKey } from "../contexts/SettingsContext";
import { useEffect, useState } from "react";
import { documentService, StoreResult } from "../document/DocumentService";
import { useUser } from "../contexts/AuthenticationContext";
import Document from "../document/Document";

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
  const [rootFolder, setRootFolder] = useState<Document | undefined>();

  useEffect(() => {
    documentService
      .loadDocument(user, documentsId, user, settingsKey)
      .then((document) => setRootFolder(document as Document));
  }, [user, settingsKey, documentsId]);
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
