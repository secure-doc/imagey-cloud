import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "../contexts/AuthenticationContext";
import { documentService } from "../document/DocumentService";
import { useReloadableLoad } from "../hooks/useReloadableLoad";
import { Profile, Profile as ProfileType } from "../profile/Profile";
import ProfilePicturePanel from "../profile/ProfilePicturePanel";
import ProfileEmailList from "../profile/ProfileEmailList";
import ProfileNameInput from "../profile/ProfileNameInput";
import ProfileSaveButton from "../profile/ProfileSaveButton";
import { SettingsList } from "./Settings";
import { useBackButton } from "../contexts/ActionBarContext";
import { useSettingsKey } from "../contexts/SettingsContext";

export default function ProfilePage({ id }: { id: string }) {
  const { t } = useTranslation();
  const user = useUser();
  const settingsKey = useSettingsKey();
  useBackButton();

  const [profile, setProfile] = useState<ProfileType>({ name: "", emails: [] });
  const [picture, setPicture] = useState<Blob | undefined>();
  const [newPicture, setNewPicture] = useState<File | undefined>();
  const [loading, setLoading] = useState<boolean>(true);

  // loadDocument never rejects - a failed fetch/decrypt is a `loadFailed`
  // placeholder. Surface it and retry rather than showing an empty profile.
  const { failed: loadFailed } = useReloadableLoad(async () => {
    setLoading(true);
    const loadedDoc = await documentService.loadDocument(
      user,
      id,
      user,
      settingsKey,
    );
    if (loadedDoc.loadFailed) {
      console.error("Failed to load profile document");
      setLoading(false);
      return false;
    }
    const loaded = loadedDoc as Profile;
    if (loaded) {
      const p: Profile = { ...loaded, emails: loaded.emails ?? [] };
      setProfile(p);
      if (p.profilePictureId && p.key) {
        try {
          const content = await documentService.loadContent(
            user,
            loadedDoc,
            p.profilePictureId,
          );
          setPicture(new Blob([content]));
        } catch (e) {
          console.error("Failed to load profile picture", e);
        }
      }
    }
    setLoading(false);
    return true;
  }, [user, id, settingsKey]);

  if (loading) {
    return (
      <main className="responsive">
        <div className="space"></div>
        <article className="round elevate">
          <progress className="circle"></progress>
        </article>
      </main>
    );
  }

  return (
    <main className="grid no-margin">
      <SettingsList className="m l" />
      <div className="col scroll s12 m6 l6">
        <div className="space"></div>
        <article className="round elevate padding">
          <h5 className="margin-bottom center-align">{t("Profile")}</h5>
          {loadFailed && (
            <div className="padding error-text center-align">
              {t("Could not load your profile. Retrying...")}
            </div>
          )}
          <ProfilePicturePanel
            picture={picture}
            onPictureChange={setNewPicture}
          />
          <ProfileNameInput
            name={profile.name}
            fallback={user}
            onNameChange={(val) => setProfile({ ...profile, name: val })}
          />
          <hr className="large" />
          <ProfileEmailList
            emails={profile.emails}
            onEmailsChange={(updated) =>
              setProfile({ ...profile, emails: updated })
            }
          />

          <nav className="right-align">
            <ProfileSaveButton
              id={id}
              profile={profile}
              newPicture={newPicture}
              onProfileChange={(profile) => {
                setProfile(profile);
                setNewPicture(undefined);
              }}
            />
          </nav>
        </article>
        <div className="space"></div>
      </div>
    </main>
  );
}
