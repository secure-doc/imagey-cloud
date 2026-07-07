import { useTranslation } from "react-i18next";
import Panel from "../components/Panel";
import UploadButton from "../components/UploadButton";

import DocumentMetadata from "../document/DocumentMetadata";

export default function UploadPanel({
  className,
  onUploadComplete,
}: {
  className?: string;
  onUploadComplete?: (document: DocumentMetadata) => void;
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
