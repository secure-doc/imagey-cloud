import { useEffect, useState } from "react";
import "./translation/i18n";
import "beercss";
import "material-dynamic-colors";
import AuthenticationComponent from "./authentication/AuthenticationComponent";
import { ActionBarContextProvider } from "./contexts/ActionBarContext";
import { BrowserRouter, Route, Routes } from "react-router";
import Navigation from "./components/Navigation";
import Images from "./pages/Images";
import Image from "./pages/Image";
import Chats from "./pages/Chats";
import AppBar from "./components/AppBar";
import Settings from "./pages/Settings";
import Devices from "./pages/Devices";
import {
  Email,
  JsonWebKeyPairs,
  AuthenticationContext,
} from "./contexts/AuthenticationContext";

function App() {
  /*
  There are different situations how we come to here:
  1. "currentUser" local storage property is not set.
     User has to put in her/his email address and the symmetric key is tried to receive.
     a) Symmetric key is gotten, "currentUser" obviously was lost and has to be set.
        Go on with 2.
     b) Symmetric key cannot be found. Trigger registration mail.
     c) Symmetric key cannot be received, because the user is not authenticated. Trigger login mail. 
  2. "currentUser" local storage property is set.
     Symmetric key is tried to receive.
     a) Symmetric key cannot be found. Trigger registration mail.
     b) Symmetric key cannot be received, because the user is not authenticated. Trigger login mail. 
     c) Symmetric key can be received.
        - Successfully decrypt private key. User is logged in.
        - Private key cannot be decrypted.
          Either device id is missing or private key is missing or something else went wrong.
          Device has to be reregistered.
          - Create and register device id and encrypt private key. User is logged in.
  3. User comes with login token
     Set "currentUser" local storage property and go on with 2. 
  4. User comes with registration token.
     Create symmetric key, register device. User is logged in.
  */
  const [user, setUser] = useState<Email>();
  const [keyPairs, setKeyPairs] = useState<JsonWebKeyPairs>();
  useEffect(() => {
    ui("theme", "#1176f3");
  }, []);
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
  return (
    <AuthenticationContext.Provider value={{ user, keyPairs }}>
      <ActionBarContextProvider>
        <BrowserRouter>
          <AppBar />
          <Navigation className="left max l" />
          <Navigation className="left m" />
          <Routes>
            <Route path="/" element={<Images />} />
            <Route path="images">
              <Route index element={<Images />} />
              <Route path=":id" element={<Image />} />
            </Route>
            <Route path="chats" element={<Chats />} />
            <Route path="settings">
              <Route index element={<Settings />} />
              <Route path="devices" element={user && <Devices />} />
            </Route>
          </Routes>
          <aside></aside>
          <Navigation className="bottom s" />
        </BrowserRouter>
      </ActionBarContextProvider>
    </AuthenticationContext.Provider>
  );
}

export default App;
