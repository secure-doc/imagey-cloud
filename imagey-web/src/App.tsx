import { useCallback, useContext, useEffect, useState } from "react";
import "./translation/i18n";
import { useTranslation } from "react-i18next";
import "beercss";
import "material-dynamic-colors";
import AuthenticationComponent from "./authentication/AuthenticationComponent";
import { ActionBarContextProvider } from "./contexts/ActionBarContextProvider";
import { BrowserRouter, NavLink, Route, Routes, Outlet } from "react-router";
import Navigation from "./components/Navigation";
import Image from "./pages/Image";
import Media from "./pages/Media";
import Chats from "./pages/Chats";
import Chat from "./pages/Chat";
import GroupChat from "./pages/GroupChat";
import AppBar from "./components/AppBar";
import Settings from "./pages/Settings";
import Profile from "./pages/ProfilePage";
import Devices from "./pages/Devices";
import Join from "./pages/Join";
import FederationAccept from "./pages/FederationAccept";
import PendingFederatedInvitationRedirect from "./federation/PendingFederatedInvitationRedirect";
import { setFederationProvider } from "./federation/federationProvider";
import NotificationSettings from "./notification/NotificationSettings";
import { pushSubscriptionService } from "./notification/PushSubscriptionService";
import { setGuestTokenProvider } from "./api/repositoriesFor";
import { createFederationGuestTokenProvider } from "./federation/federationGuestTokenProvider";
import {
  Email,
  JsonWebKeyPairs,
  AuthenticationContext,
  Settings as SettingsType,
} from "./contexts/AuthenticationContext";
import { UserId } from "./authentication/UserId";
import Activities from "./pages/Activities";
import { SettingsContext } from "./contexts/SettingsContext";

import { useParams } from "react-router";
import { documentService } from "./document/DocumentService";
import Folder from "./folder/Folder";
import { FolderContext, FolderInfo } from "./contexts/FolderContext";
import DocumentsPage from "./pages/DocumentsPage";
import SharedWithMe from "./pages/SharedWithMe";
import {
  useRegisterSharedFolder,
  useSharedFolders,
} from "./hooks/useSharedFolders";
import { DetailContext, DetailInfo } from "./contexts/DetailContext";

function DocumentRoute() {
  const { t } = useTranslation();
  const { documentId } = useParams();
  const { folders } = useContext(FolderContext);
  const registerShared = useRegisterSharedFolder();
  // Nothing is known about this folder yet (a reload, or a link): it may be one shared with us,
  // which is told by the "chats" document. A folder of our own tree is found by its parents.
  const unknown =
    !!documentId &&
    !folders[documentId]?.parentId &&
    !folders[documentId]?.owner;
  const { folders: sharedFolders, reload } = useSharedFolders(unknown);
  const shared = sharedFolders?.find((f) => f.documentId === documentId);
  useEffect(() => {
    if (shared) {
      registerShared(shared);
    }
  }, [shared, registerShared]);
  if (!documentId || (unknown && (sharedFolders === undefined || shared))) {
    return null;
  }
  if (unknown && sharedFolders === null) {
    // Whether it is shared with us is not known: say so instead of claiming it is not.
    return (
      <main>
        <div className="column scroll">
          <p>{t("Could not load your folders.")}</p>
          <button onClick={reload}>{t("Retry")}</button>
        </div>
      </main>
    );
  }
  if (unknown) {
    // Its key and place cannot be derived: it has to be opened from the folder it is in.
    return (
      <main>
        <div className="column scroll">
          <p>{t("This folder cannot be opened directly.")}</p>
          <NavLink to="/documents">{t("Open your folders")}</NavLink>
        </div>
      </main>
    );
  }
  return <Folder id={documentId} />;
}

function ChatRoute() {
  const { contactUserId } = useParams();
  return contactUserId ? (
    <Chat key={contactUserId} contactUserId={contactUserId} />
  ) : null;
}

function GroupChatRoute() {
  const { groupId } = useParams();
  return groupId ? <GroupChat key={groupId} groupId={groupId} /> : null;
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
  const [user, setUser] = useState<UserId>();
  const [email, setEmail] = useState<Email>();
  const [keyPairs, setKeyPairs] = useState<JsonWebKeyPairs>();
  const [settings, setSettings] = useState<SettingsType | undefined>();
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false);
  const { t } = useTranslation();
  const [folders, setFolders] = useState<Record<string, FolderInfo>>({});

  const [details, setDetails] = useState<Record<string, DetailInfo>>({});

  const registerDetail = useCallback((info: DetailInfo) => {
    setDetails((prev) => ({ ...prev, [info.documentId]: info }));
  }, []);

  const registerParentFolder = useCallback((id: string, parentId: string) => {
    setFolders((prev) => {
      const folder = prev[id] || {};
      if (folder.parentId === parentId) {
        return prev;
      }
      return { ...prev, [id]: { ...folder, parentId } };
    });
  }, []);

  const registerKey = useCallback((id: string, key: JsonWebKey) => {
    setFolders((prev) => {
      const folder = prev[id] || {};
      if (folder.key === key) {
        return prev;
      }
      return { ...prev, [id]: { ...folder, key } };
    });
  }, []);

  const registerFolder = useCallback(
    (id: string, info: Partial<FolderInfo>) => {
      setFolders((prev) => ({ ...prev, [id]: { ...prev[id], ...info } }));
    },
    [],
  );

  // The settings document is the parent of the documents root folder, so the
  // root folder key can be derived on every page, not just the documents page.
  useEffect(() => {
    if (!user || !settings) {
      return;
    }
    registerParentFolder(settings.documents, user);
    registerKey(user, settings.settingsKey);
  }, [user, settings, registerParentFolder, registerKey]);

  useEffect(() => {
    ui("theme", "#1176f3");
  }, []);

  // Guest sessions at other servers (ADR 0013): one provider per signed-in user, so
  // it never hands out the assertion of somebody else.
  useEffect(() => {
    // Not before somebody is signed in: until then the provider is not ours to set.
    if (user) {
      const provider = createFederationGuestTokenProvider(() => ({
        userId: user,
        email,
      }));
      setGuestTokenProvider(provider);
      setFederationProvider(provider);
    }
  }, [user, email]);

  useEffect(() => {
    if (user && keyPairs) {
      pushSubscriptionService
        .reconcile(user, keyPairs.deviceKeyPair)
        .catch((e) => console.warn("Failed to reconcile push subscription", e));
    }
  }, [user, keyPairs]);

  useEffect(() => {
    if (user && keyPairs && !settings && !settingsLoadFailed) {
      documentService
        .getSettings(
          user,
          keyPairs.mainKeyPair.publicKey,
          keyPairs.mainKeyPair.privateKey,
        )
        .then((s) => setSettings(s))
        .catch((e) => {
          console.error("Failed to load settings", e);
          setSettingsLoadFailed(true);
        });
    }
  }, [user, keyPairs, settings, settingsLoadFailed]);

  // The landing page of an emailed invitation needs no session (ADR 0013 A11).
  if (window.location.pathname === "/join") {
    return <Join />;
  }

  if (!user || !keyPairs) {
    return (
      <AuthenticationComponent
        onKeysDecrypted={(user, email, keyPairs) => {
          setUser(user);
          setEmail(email);
          setKeyPairs(keyPairs);
        }}
      />
    );
  }

  if (settingsLoadFailed) {
    return (
      <dialog className="surface-bright" open>
        <p>{t("Could not load your settings.")}</p>
        <nav className="right-align">
          <button onClick={() => setSettingsLoadFailed(false)}>
            {t("Retry")}
          </button>
        </nav>
      </dialog>
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
    <AuthenticationContext.Provider value={{ user, email, keyPairs, settings }}>
      <SettingsContext.Provider
        value={{
          settingsKey: settings.settingsKey,
          documentsId: settings.documents,
          chatsId: settings.chats,
          profileId: settings.profile,
        }}
      >
        <FolderContext.Provider
          value={{
            folders,
            registerParentFolder,
            registerKey,
            registerFolder,
          }}
        >
          <DetailContext.Provider value={{ details, registerDetail }}>
            <ActionBarContextProvider>
              <BrowserRouter>
                <PendingFederatedInvitationRedirect />
                <AppBar />
                <Navigation className="left max l" />
                <Navigation className="left m" />
                <Routes>
                  <Route element={<BottomNavLayout />}>
                    <Route path="/" element={<Activities />} />
                    <Route path="images">
                      <Route index element={<DocumentsPage />} />
                    </Route>
                    <Route path="documents">
                      <Route index element={<DocumentsPage />} />
                      <Route path=":documentId" element={<DocumentRoute />} />
                    </Route>
                    <Route path="shared" element={<SharedWithMe />} />
                    <Route
                      path="chats"
                      element={<Chats id={settings.chats} />}
                    />
                    <Route path="settings">
                      <Route index element={<Settings />} />
                      <Route
                        path="profile"
                        element={user && <Profile id={settings.profile} />}
                      />
                      <Route path="devices" element={user && <Devices />} />
                      <Route
                        path="notifications"
                        element={user && <NotificationSettings />}
                      />
                    </Route>
                  </Route>
                  <Route path="chats/:contactUserId" element={<ChatRoute />} />
                  <Route
                    path="chats/groups/:groupId"
                    element={<GroupChatRoute />}
                  />
                  <Route
                    path="federation/accept"
                    element={<FederationAccept />}
                  />
                  <Route path="images/:id" element={<Image />} />
                  <Route path="media/:id" element={<Media />} />
                </Routes>
                <aside></aside>
              </BrowserRouter>
            </ActionBarContextProvider>
          </DetailContext.Provider>
        </FolderContext.Provider>
      </SettingsContext.Provider>
    </AuthenticationContext.Provider>
  );
}

export default App;
