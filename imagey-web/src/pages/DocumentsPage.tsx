import { useContext, useEffect } from "react";
import { useUser } from "../contexts/AuthenticationContext";
import { useDocumentsId, useSettingsKey } from "../contexts/SettingsContext";
import { FolderContext } from "../contexts/FolderContext";
import { useNavigate } from "react-router";

export default function DocumentsPage() {
  const settingsId = useUser();
  const settingsKey = useSettingsKey();
  const documentsId = useDocumentsId();
  const { registerParentFolder, registerKey } = useContext(FolderContext);
  const navigate = useNavigate();

  useEffect(() => {
    registerParentFolder(documentsId, settingsId);
    registerKey(settingsId, settingsKey);
    navigate("/documents/" + documentsId, { replace: true });
  }, [
    documentsId,
    settingsId,
    settingsKey,
    registerParentFolder,
    registerKey,
    navigate,
  ]);

  return null;
}
