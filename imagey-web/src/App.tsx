import { useEffect, useState } from "react";
import "./translation/i18n";
import "beercss";
import "material-dynamic-colors";
import AuthenticationComponent from "./authentication/AuthenticationComponent";
import { ActionBarContextProvider } from "./contexts/ActionBarContextProvider";
import { BrowserRouter, Route, Routes, Outlet } from "react-router";
import Navigation from "./components/Navigation";
import Images from "./pages/Images";
import Image from "./pages/Image";
import Chats from "./pages/Chats";
import Chat from "./pages/Chat";
import AppBar from "./components/AppBar";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Devices from "./pages/Devices";
import {
  Email,
  JsonWebKeyPairs,
  AuthenticationContext,
  Settings as SettingsType,
} from "./contexts/AuthenticationContext";
import Activities from "./pages/Activities";
import { SettingsContext } from "./contexts/SettingsContext";

import { useParams } from "react-router";
import { documentService } from "./document/DocumentService";

function ChatRoute() {
  const { contactEmail } = useParams();
  return contactEmail ? <Chat contactEmail={contactEmail} /> : null;
}

function BottomNavLayout() {
  return (
    <>
      <Outlet />
      <Navigation className="bottom s" />
    </>
  );
}

function App() {
  const [user, setUser] = useState<Email>();
  const [keyPairs, setKeyPairs] = useState<JsonWebKeyPairs>();
  const [settings, setSettings] = useState<SettingsType | undefined>();
  useEffect(() => {
    ui("theme", "#1176f3");
  }, []);

  useEffect(() => {
    if (user && keyPairs && !settings) {
      documentService
        .getSettings(
          user,
          keyPairs.mainKeyPair.publicKey,
          keyPairs.mainKeyPair.privateKey,
        )
        .then((s) => setSettings(s));
    }
  }, [user, keyPairs, settings]);

  if (!user || !keyPairs) {
    return (
      <AuthenticationComponent
        onKeysDecrypted={(user, keyPairs) => {
          setUser(user);
          setKeyPairs(keyPairs);
        }}
      />
    );
  }

  if (!settings) {
    return (
      <dialog className="surface-bright" open>
        Loading settings...
      </dialog>
    );
  }

  return (
    <AuthenticationContext.Provider value={{ user, keyPairs, settings }}>
      <SettingsContext.Provider
        value={{
          settingsKey: settings.settingsKey,
          documentsId: settings.documents,
          chatsId: settings.chats,
          profileId: settings.profile,
        }}
      >
        <ActionBarContextProvider>
          <BrowserRouter>
            <AppBar />
            <Navigation className="left max l" />
            <Navigation className="left m" />
            <Routes>
              <Route element={<BottomNavLayout />}>
                <Route path="/" element={<Activities />} />
                <Route path="images">
                  <Route index element={<Images />} />
                  <Route path=":id" element={<Image />} />
                </Route>
                <Route path="chats" element={<Chats />} />
                <Route path="settings">
                  <Route index element={<Settings />} />
                  <Route path="profile" element={user && <Profile />} />
                  <Route path="devices" element={user && <Devices />} />
                </Route>
              </Route>
              <Route path="chats/:contactEmail" element={<ChatRoute />} />
            </Routes>
            <aside></aside>
          </BrowserRouter>
        </ActionBarContextProvider>
      </SettingsContext.Provider>
    </AuthenticationContext.Provider>
  );
}

export default App;
