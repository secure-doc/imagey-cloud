import { useTranslation } from "react-i18next";
import { useBackButton, useTitle } from "../contexts/ActionBarContext";
import { iconTileUrl } from "../components/iconTile";
import {
  useOpenSharedFolder,
  useSharedFolders,
} from "../hooks/useSharedFolders";

// "Shared with me": the folders other users shared with the user in a chat.
export default function SharedWithMe() {
  const { t } = useTranslation();
  useBackButton("/documents");
  useTitle(t("Shared with me"));
  const { folders, reload } = useSharedFolders();
  const open = useOpenSharedFolder();

  return (
    <main>
      <div className="column scroll">
        {folders === undefined ? (
          <progress className="circle"></progress>
        ) : folders === null ? (
          <>
            <p>{t("Could not load the shared folders.")}</p>
            <button onClick={reload}>{t("Retry")}</button>
          </>
        ) : folders.length === 0 ? (
          <p>{t("Nothing has been shared with you yet.")}</p>
        ) : (
          folders.map((entry) => (
            <img
              key={entry.documentId}
              src={iconTileUrl("folder", entry.name || "Folder")}
              alt={entry.name}
              className="small-width small-height"
              style={{ cursor: "pointer" }}
              onClick={() => open(entry)}
            />
          ))
        )}
      </div>
    </main>
  );
}
