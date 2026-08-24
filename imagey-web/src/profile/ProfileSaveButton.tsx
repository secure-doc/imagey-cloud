import { useTranslation } from "react-i18next";
import { Profile } from "./Profile";
import { useContext, useState } from "react";
import { documentService } from "../document/DocumentService";
import { AuthenticationContext } from "../contexts/AuthenticationContext";

export default function ProfileSaveButton({
  id,
  profile,
  newPicture,
  onProfileChange,
}: {
  id: string;
  profile: Profile;
  newPicture?: File;
  onProfileChange: (profile: Profile) => void;
}) {
  const { t } = useTranslation();
  const auth = useContext(AuthenticationContext);
  const [saving, setSaving] = useState<boolean>(false);
  const [showSnackbar, setShowSnackbar] = useState<boolean>(false);

  const handleSave = async () => {
    if (!profile.key) {
      console.error("Cannot save profile without its document key");
      return;
    }

    setSaving(true);
    try {
      const profileToSave: Profile = { ...profile };

      if (newPicture) {
        profileToSave.profilePictureId = await documentService.storeContent(
          auth.user,
          id,
          profile.key,
          newPicture,
        );
      }

      const newEtag = await documentService.updateDocumentMetadata(
        auth.user,
        id,
        profile.key,
        {
          name: profileToSave.name,
          emails: profileToSave.emails,
          profilePictureId: profileToSave.profilePictureId,
        },
        profile.etag,
      );
      // Adopt the ETag the server just assigned, otherwise a second save in the
      // same session still sends the old If-Match and gets a 412.
      profileToSave.etag = newEtag ?? undefined;

      onProfileChange(profileToSave);
      setShowSnackbar(true);
      setTimeout(() => setShowSnackbar(false), 3000);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  return (
    <>
      <button className="primary round" onClick={handleSave} disabled={saving}>
        {saving ? <progress className="circle small"></progress> : <i>save</i>}
        <span>{t("Save")}</span>
      </button>
      <div className={`snackbar ${showSnackbar ? "active" : ""}`}>
        <i>check</i>
        <span>{t("Profile saved")}</span>
      </div>
    </>
  );
}
