import { useContext } from "react";
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
  registerParentFolder(documentsId, settingsId);
  registerKey(settingsId, settingsKey);
  navigate("/documents/" + documentsId);
  return null;
}
