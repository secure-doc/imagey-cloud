import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import UploadButton from "../components/UploadButton";
import { useActionIcons } from "../contexts/ActionBarContext";
import { StoreResult } from "../document/DocumentService";
import { useParentFolderId } from "../contexts/FolderContext";
import { useNavigate } from "react-router";
import { useDocumentsId } from "../contexts/SettingsContext";
import Document from "../document/Document";
import { FolderMetadata } from "../document/DocumentMetadata";

export function useFolderIcons(
  id: string,
  folder: Document<FolderMetadata> | undefined,
  onCreateFolder: () => void,
  onDocumentUploaded: (result: StoreResult) => void,
) {
  const { t } = useTranslation();
  const documentsId = useDocumentsId();
  const parentId = useParentFolderId(id);
  const navigate = useNavigate();

  const actionIcons = useMemo(() => {
    const icons = [];
    if (id !== documentsId) {
      icons.push(
        <button
          key="back"
          aria-label="back-button"
          className="circle transparent"
          onClick={() => navigate("/documents/" + parentId)}
        >
          <i>arrow_back</i>
        </button>,
      );
    }

    if (folder) {
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
                folder={folder}
                onUploadComplete={onDocumentUploaded}
              >
                {t("Upload Document")}
              </UploadButton>
            </li>
            <li>
              <a onClick={onCreateFolder}>{t("Create Folder")}</a>
            </li>
          </menu>
        </button>,
      );
    } else {
      icons.push(
        <button
          key="add-menu"
          aria-label="add-menu"
          className="circle transparent"
          onClick={onCreateFolder}
        >
          <i>add</i>
        </button>,
      );
    }
    return icons;
  }, [
    t,
    id,
    parentId,
    documentsId,
    folder,
    navigate,
    onCreateFolder,
    onDocumentUploaded,
  ]);
  useActionIcons(actionIcons);
}
