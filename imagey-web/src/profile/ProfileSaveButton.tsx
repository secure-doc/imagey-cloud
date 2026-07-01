import { useTranslation } from "react-i18next";
import { Profile } from "./Profile";
import { useContext, useState } from "react";
import { documentService } from "../document/DocumentService";
import { AuthenticationContext } from "../contexts/AuthenticationContext";
import { profileService } from "./ProfileService";

export default function ProfileSaveButton({
  profile,
  newPicture,
  onProfileChange,
}: {
  profile: Profile;
  newPicture?: File;
  onProfileChange: (profile: Profile) => void;
}) {
  const { t } = useTranslation();
  const auth = useContext(AuthenticationContext);
  const [saving, setSaving] = useState<boolean>(false);
  const [showSnackbar, setShowSnackbar] = useState<boolean>(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const profileToSave = { ...profile };

      if (newPicture) {
        // Upload the new picture document first
        const docMeta = await documentService.storeDocument(
          auth.user,
          newPicture,
          auth.keyPairs.mainKeyPair.publicKey,
          auth.keyPairs.mainKeyPair.privateKey,
        );
        profileToSave.profilePictureId = docMeta.documentId;
      }

      await profileService.saveProfile(
        auth.user,
        profileToSave,
        auth.keyPairs.mainKeyPair.publicKey,
        auth.keyPairs.mainKeyPair.privateKey,
      );
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
