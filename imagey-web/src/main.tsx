import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { getAppName, initAppName } from "./utils/appName.ts";
import { registerServiceWorker } from "./serviceWorkerRegistration.ts";

import { contactService } from "./contact/ContactService";
import { groupService } from "./contact/GroupService";
import { deviceService } from "./device/DeviceService";
import { documentService } from "./document/DocumentService";
import { cryptoService } from "./authentication/CryptoService";
import { publicProfileService } from "./profile/publicProfileService";
import { handlePush } from "./notification/handlePush";
import { notificationStore } from "./notification/NotificationStore";
import { notificationKeyringService } from "./notification/NotificationKeyringService";
import { pushSubscriptionService } from "./notification/PushSubscriptionService";
import { pushSubscriptionRepository } from "./notification/PushSubscriptionRepository";
import { createRemoteApiClient } from "./api/RemoteApiClient";
import { guestSessionStore } from "./api/GuestSessionStore";
import { repositoriesFor, setGuestTokenProvider } from "./api/repositoriesFor";
import { createDocumentRepository } from "./document/DocumentRepository";
import { createMessageRepository } from "./chat/MessageRepository";
import { createContactRepository } from "./contact/ContactRepository";
import { FederationUnavailableError } from "./api/GuestTokenProvider";
import { createTranslator } from "./notification/notificationTranslations";

declare global {
  interface Window {
    contactService: typeof contactService;
    groupService: typeof groupService;
    deviceService: typeof deviceService;
    documentService: typeof documentService;
    cryptoService: typeof cryptoService;
    publicProfileService: typeof publicProfileService;
    handlePush: typeof handlePush;
    notificationStore: typeof notificationStore;
    notificationKeyringService: typeof notificationKeyringService;
    pushSubscriptionService: typeof pushSubscriptionService;
    pushSubscriptionRepository: typeof pushSubscriptionRepository;
    createTranslator: typeof createTranslator;
    remoteApi: {
      createRemoteApiClient: typeof createRemoteApiClient;
      createDocumentRepository: typeof createDocumentRepository;
      createMessageRepository: typeof createMessageRepository;
      createContactRepository: typeof createContactRepository;
      guestSessionStore: typeof guestSessionStore;
      repositoriesFor: typeof repositoriesFor;
      setGuestTokenProvider: typeof setGuestTokenProvider;
      FederationUnavailableError: typeof FederationUnavailableError;
    };
  }
}

if (import.meta.env.DEV) {
  window.contactService = contactService;
  window.groupService = groupService;
  window.deviceService = deviceService;
  window.documentService = documentService;
  window.cryptoService = cryptoService;
  window.publicProfileService = publicProfileService;
  window.handlePush = handlePush;
  window.notificationStore = notificationStore;
  window.notificationKeyringService = notificationKeyringService;
  window.pushSubscriptionService = pushSubscriptionService;
  window.pushSubscriptionRepository = pushSubscriptionRepository;
  window.createTranslator = createTranslator;
  window.remoteApi = {
    createRemoteApiClient,
    createDocumentRepository,
    createMessageRepository,
    createContactRepository,
    guestSessionStore,
    repositoriesFor,
    setGuestTokenProvider,
    FederationUnavailableError,
  };
}

registerServiceWorker();

initAppName().then(() => {
  document.title = getAppName();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
