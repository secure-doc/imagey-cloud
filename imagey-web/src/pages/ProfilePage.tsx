import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "../contexts/AuthenticationContext";
import { documentService } from "../document/DocumentService";
import { useReloadableLoad } from "../hooks/useReloadableLoad";
import { Profile as ProfileType } from "../profile/Profile";
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

  const [profile, setProfile] = useState<ProfileType | undefined>();
  // The profile as last loaded/saved - used by ProfileSaveButton to tell
  // whether the name actually changed (see docs/plans/chat-public-profile.md
  // §3.5, trigger 2), without re-triggering a public-profile name update on
  // every save when the user only changed their picture or emails.
  const [savedProfile, setSavedProfile] = useState<ProfileType | undefined>();
  const [picture, setPicture] = useState<Blob | undefined>();
  const [newPicture, setNewPicture] = useState<File | undefined>();
  const [loading, setLoading] = useState<boolean>(true);

  // A failed load rejects (documentService.DocumentLoadError); useReloadableLoad
  // catches it, surfaces `loadFailed`, and retries rather than showing an
  // empty profile.
  const { failed: loadFailed } = useReloadableLoad(async () => {
    setLoading(true);
    try {
      const loaded = await documentService.loadDocument(
        user,
        id,
        user,
        settingsKey,
      );
      if (loaded.type !== "profile") {
        throw new Error(`Expected a profile document, got ${loaded.type}`);
      }
      setProfile(loaded);
      setSavedProfile(loaded);
      if (loaded.profileImageId) {
        try {
          const content = await documentService.loadContent(
            loaded,
            loaded.profileImageId,
          );
          setPicture(new Blob([content]));
        } catch (e) {
          console.error("Failed to load profile picture", e);
        }
      }
      return true;
    } finally {
      setLoading(false);
    }
  }, [user, id, settingsKey]);

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
          {loading || !profile || !savedProfile ? (
            <div className="center-align">
              <progress className="circle"></progress>
            </div>
          ) : (
            <>
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
                  savedName={savedProfile.name}
                  newPicture={newPicture}
                  onProfileChange={(profile) => {
                    setProfile(profile);
                    setSavedProfile(profile);
                    setNewPicture(undefined);
                  }}
                />
              </nav>
            </>
          )}
        </article>
        <div className="space"></div>
      </div>
    </main>
  );
}
