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
  options: {
    onShareFolder?: () => void;
    // Whether the user may add content here (always for an own folder; for
    // a shared one as the owner told us).
    canAdd?: boolean;
    // The folder belongs to somebody else: it cannot be shared on.
    shared?: boolean;
  } = {},
) {
  const { onShareFolder, canAdd = true, shared = false } = options;
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

    if (id === documentsId) {
      icons.push(
        <button
          key="shared-with-me"
          aria-label="shared-with-me"
          title={t("Shared with me")}
          className="circle transparent"
          onClick={() => navigate("/shared")}
        >
          <i>folder_shared</i>
        </button>,
      );
    }

    if (folder && !canAdd) {
      // A folder shared read-only: nothing to add.
    } else if (folder) {
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
            {onShareFolder && !shared && id !== documentsId && (
              <li>
                <a onClick={onShareFolder}>{t("Share folder")}</a>
              </li>
            )}
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
    onShareFolder,
    canAdd,
    shared,
  ]);
  useActionIcons(actionIcons);
}
