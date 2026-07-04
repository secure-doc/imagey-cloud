import { useTranslation } from "react-i18next";
import Panel from "../components/Panel";
import UploadButton from "../components/UploadButton";

import DocumentMetadata from "../document/DocumentMetadata";

export default function UploadPanel({
  className,
  onUploadComplete,
  parentFolderId,
  parentFolderKey,
}: {
  className?: string;
  onUploadComplete?: (document: DocumentMetadata) => void;
  parentFolderId?: string;
  parentFolderKey?: JsonWebKey;
}) {
  const { t } = useTranslation();

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
            parentFolderId={parentFolderId}
            parentFolderKey={parentFolderKey}
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
