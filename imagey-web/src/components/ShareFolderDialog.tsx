import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "../contexts/AuthenticationContext";
import { useChatsId, useSettingsKey } from "../contexts/SettingsContext";
import Document from "../document/Document";
import { ContactEntry, FolderMetadata } from "../document/DocumentMetadata";
import {
  ChatsDocumentState,
  loadChatsDocument,
} from "../contact/ContactService";
import { contactDisplayName } from "../contact/contactDisplayName";
import {
  folderShareService,
  NoAddressToShareWithError,
  ShareFolderResult,
} from "../folder/FolderShareService";

interface ShareFolderDialogProps {
  folder: Document<FolderMetadata>;
  onClose: () => void;
  onShared: (result: ShareFolderResult) => void;
}

// Shares an own folder with one contact (docs/plans/share-folders.md §4.1):
// read-only, or with contributions - then the contact may add content and
// change the list of the folder.
export default function ShareFolderDialog({
  folder,
  onClose,
  onShared,
}: ShareFolderDialogProps) {
  const { t } = useTranslation();
  const user = useUser();
  const chatsId = useChatsId();
  const settingsKey = useSettingsKey();
  const [chatsDocument, setChatsDocument] = useState<ChatsDocumentState>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [contactUserId, setContactUserId] = useState("");
  const [contributions, setContributions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    loadChatsDocument(user, chatsId, settingsKey)
      .then((loaded) => {
        if (!cancelled) {
          setChatsDocument(loaded);
        }
      })
      .catch((e) => {
        console.error("Failed to load the contacts", e);
        if (!cancelled) {
          setLoadFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, chatsId, settingsKey]);

  const contact: ContactEntry | undefined = chatsDocument?.contacts.find(
    (c) => c.userId === contactUserId,
  );
  // A contact whose home is another server reads as a guest and cannot contribute (ADR 0013,
  // F10c).
  const foreign = !!contact?.chatOrigin || !!contact?.profileHome;

  const handleShare = async () => {
    if (!chatsDocument || !contact) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await folderShareService.shareFolder(
        user,
        chatsDocument,
        folder,
        contact,
        contributions && !foreign,
      );
      onShared(result);
      onClose();
    } catch (e) {
      console.error("Failed to share the folder", e);
      setError(
        e instanceof NoAddressToShareWithError
          ? t("There is no address to share with this contact.")
          : t("Could not share the folder."),
      );
      setBusy(false);
    }
  };

  return (
    <>
      <div className="overlay active" onClick={onClose}></div>
      <dialog className="surface-bright active" open aria-label="share-folder">
        <h5>{t("Share folder")}</h5>
        {loadFailed ? (
          <p>{t("Could not load your contacts.")}</p>
        ) : !chatsDocument ? (
          <progress className="circle"></progress>
        ) : chatsDocument.contacts.length === 0 ? (
          <p>{t("You have no contacts yet.")}</p>
        ) : (
          <>
            <div className="field label suffix border">
              <select
                value={contactUserId}
                onChange={(e) => setContactUserId(e.target.value)}
                disabled={busy}
                aria-label={t("Contact")}
              >
                <option value="" disabled></option>
                {chatsDocument.contacts.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {contactDisplayName(c.userId, c, t("Unknown contact"))}
                  </option>
                ))}
              </select>
              <label>{t("Contact")}</label>
              <i>arrow_drop_down</i>
            </div>
            <div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={contributions && !foreign}
                  disabled={busy || foreign}
                  onChange={(e) => setContributions(e.target.checked)}
                  aria-label={t("May add content")}
                />
                <span>{t("May add content")}</span>
              </label>
              {foreign && (
                <p className="small-text">
                  {t(
                    "Contributions are not possible for contacts on another server.",
                  )}
                </p>
              )}
              {contributions && !foreign && (
                <p className="small-text">
                  {t(
                    "People with this right can add content to this folder and all folders in it, and change their lists.",
                  )}
                </p>
              )}
            </div>
          </>
        )}
        {error && <p className="error-text">{error}</p>}
        <nav className="right-align">
          <button className="transparent" onClick={onClose} disabled={busy}>
            {t("Cancel")}
          </button>
          <button onClick={handleShare} disabled={busy || !contact}>
            {busy ? <progress className="circle small"></progress> : t("Share")}
          </button>
        </nav>
      </dialog>
    </>
  );
}
