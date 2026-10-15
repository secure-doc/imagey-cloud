import { useState } from "react";
import { useTranslation } from "react-i18next";

interface SharedFolderMessageProps {
  name: string;
  contributions: boolean;
  // Opens the folder, taking it over into "Shared with me" on the first time.
  onOpen: () => Promise<void>;
}

// Renders a "shared-folder" message in a 1:1 chat: a tile that opens the folder.
export function SharedFolderMessage({
  name,
  contributions,
  onOpen,
}: SharedFolderMessageProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleOpen = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onOpen();
    } catch (e) {
      console.error("Failed to open the shared folder", e);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shared-folder">
      <div>
        <i>folder_shared</i> {t("Shared folder: {{name}}", { name })}
      </div>
      {contributions && <small>{t("You may add content.")}</small>}
      {failed && <div className="error">{t("Could not open the folder.")}</div>}
      <button disabled={busy} onClick={handleOpen}>
        {busy ? (
          <progress className="circle small"></progress>
        ) : failed ? (
          t("Retry")
        ) : (
          t("Open")
        )}
      </button>
    </div>
  );
}
