import { useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import { AuthenticationContext } from "../contexts/AuthenticationContext";
import { profileService } from "../profile/ProfileService";
import { Profile as ProfileType } from "../profile/Profile";
import ProfilePicturePanel from "../profile/ProfilePicturePanel";
import ProfileEmailList from "../profile/ProfileEmailList";
import ProfileNameInput from "../profile/ProfileNameInput";
import ProfileSaveButton from "../profile/ProfileSaveButton";
import { SettingsList } from "./Settings";
import { useBackButton } from "../contexts/ActionBarContext";

export default function Profile() {
  const { t } = useTranslation();
  const auth = useContext(AuthenticationContext);
  useBackButton();

  const [profile, setProfile] = useState<ProfileType>({ name: "", emails: [] });
  const [picture, setPicture] = useState<Blob | undefined>();
  const [newPicture, setNewPicture] = useState<File | undefined>();
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      const res = await profileService.loadProfile(auth.user, auth.settings);
      if (res) {
        setProfile(res.profile);
        if (res.picture) {
          setPicture(res.picture);
        }
      }
      setLoading(false);
    };

    loadProfile();
  }, [auth.user, auth.keyPairs, auth.settings]);

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
          <ProfilePicturePanel
            picture={picture}
            onPictureChange={setNewPicture}
          />
          <ProfileNameInput
            name={profile.name}
            fallback={auth.user}
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
