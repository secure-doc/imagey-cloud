import { useTranslation } from "react-i18next";
import { shareFile } from "../document/openDocument";

// Shown when navigator.share() needs a user gesture that has since expired
// (the load+decrypt between the tap and the call took too long - Safari is
// especially strict). "Open" re-invokes share() synchronously in the click
// handler, with the file already decrypted, so no further loading delays
// the gesture a second time.
export default function OpenFileDialog({
  file,
  onClose,
  onError,
}: {
  file: File;
  onClose: () => void;
  onError: () => void;
}) {
  const { t } = useTranslation();

  const handleOpen = () => {
    shareFile(file).then((r) => {
      if (r.result === "needsGesture") {
        onError();
      } else {
        onClose();
      }
    });
  };

  return (
    <>
      <div className="overlay active" onClick={onClose}></div>
      <dialog className="surface-bright active" open>
        <p>{t("{{name}} is ready", { name: file.name })}</p>
        <nav className="right-align">
          <button className="transparent" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button onClick={handleOpen}>{t("Open")}</button>
        </nav>
      </dialog>
    </>
  );
}
