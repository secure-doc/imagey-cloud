import { useTranslation } from "react-i18next";
import { Profile } from "./Profile";
import { publicProfileService } from "./publicProfileService";
import { useContext, useState } from "react";
import { documentService } from "../document/DocumentService";
import { AuthenticationContext } from "../contexts/AuthenticationContext";

export default function ProfileSaveButton({
  id,
  profile,
  savedName,
  newPicture,
  onProfileChange,
}: {
  id: string;
  profile: Profile;
  // The name as last loaded/saved - only a real change triggers a
  // public-profile name update (see docs/plans/chat-public-profile.md §3.5).
  savedName: string;
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
      let profileToSave: Profile = { ...profile };

      if (newPicture) {
        profileToSave.profilePictureId = await documentService.storeContent(
          auth.user,
          id,
          profile.key,
          newPicture,
        );
      }

      // §3.5: an avatar upload and/or a real name change each update the
      // shared "public-profile" Document, ensured (get-or-create) once up
      // front so applying both only resolves it a single time. Done before
      // the private profile's own save below so a freshly created
      // public-profile's id (publicProfileId) is included in that single
      // write, instead of a second one right after.
      const nameChanged =
        profileToSave.name && profileToSave.name !== savedName;
      if (newPicture || nameChanged) {
        const ensured = await publicProfileService.ensurePublicProfile(
          auth.user,
          id,
          profileToSave,
        );
        profileToSave = ensured.profile;
        if (newPicture && nameChanged) {
          const withAvatar = await publicProfileService.setAvatar(
            auth.user,
            ensured.publicProfile,
            newPicture,
          );
          await publicProfileService.setName(
            auth.user,
            withAvatar,
            profileToSave.name,
          );
        } else if (newPicture) {
          await publicProfileService.setAvatar(
            auth.user,
            ensured.publicProfile,
            newPicture,
          );
        } else if (nameChanged) {
          await publicProfileService.setName(
            auth.user,
            ensured.publicProfile,
            profileToSave.name,
          );
        }
      }

      const newEtag = await documentService.updateDocumentMetadata(
        auth.user,
        id,
        profile.key,
        {
          name: profileToSave.name,
          emails: profileToSave.emails,
          profilePictureId: profileToSave.profilePictureId,
          publicProfileId: profileToSave.publicProfileId,
        },
        profileToSave.etag,
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
