import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { getAppName, initAppName } from "./utils/appName.ts";
import { registerServiceWorker } from "./serviceWorkerRegistration.ts";

import { contactService } from "./contact/ContactService";
import { groupService } from "./contact/GroupService";
import { deviceService } from "./device/DeviceService";
import { documentService } from "./document/DocumentService";
import { folderShareService } from "./folder/FolderShareService";
import { cryptoService } from "./authentication/CryptoService";
import { publicProfileService } from "./profile/publicProfileService";
import { handlePush } from "./notification/handlePush";
import { notificationStore } from "./notification/NotificationStore";
import { notificationKeyringService } from "./notification/NotificationKeyringService";
import { pushSubscriptionService } from "./notification/PushSubscriptionService";
import { pushSubscriptionRepository } from "./notification/PushSubscriptionRepository";
import { createRemoteApiClient } from "./api/RemoteApiClient";
import { guestSessionStore } from "./api/GuestSessionStore";
import { createFederationGuestTokenProvider } from "./federation/federationGuestTokenProvider";
import { federationRepository } from "./federation/FederationRepository";
import { repositoriesFor, setGuestTokenProvider } from "./api/repositoriesFor";
import { resetPushEnabled } from "./notification/usePushEnabled";
import { servicesFor } from "./api/servicesFor";
import { placeOf } from "./federation/whereabouts";
import { parseMessageContent } from "./chat/parseMessageContent";
import { createDocumentRepository } from "./document/DocumentRepository";
import { createMessageRepository } from "./chat/MessageRepository";
import { createContactRepository } from "./contact/ContactRepository";
import { FederationUnavailableError } from "./api/GuestTokenProvider";
import { createTranslator } from "./notification/notificationTranslations";
import { capturePendingFederatedInvitation } from "./federation/pendingInvitation";

declare global {
  interface Window {
    contactService: typeof contactService;
    groupService: typeof groupService;
    deviceService: typeof deviceService;
    documentService: typeof documentService;
    folderShareService: typeof folderShareService;
    cryptoService: typeof cryptoService;
    publicProfileService: typeof publicProfileService;
    handlePush: typeof handlePush;
    notificationStore: typeof notificationStore;
    notificationKeyringService: typeof notificationKeyringService;
    pushSubscriptionService: typeof pushSubscriptionService;
    pushSubscriptionRepository: typeof pushSubscriptionRepository;
    resetPushEnabled: typeof resetPushEnabled;
    createTranslator: typeof createTranslator;
    federation: {
      federationRepository: typeof federationRepository;
      createFederationGuestTokenProvider: typeof createFederationGuestTokenProvider;
    };
    remoteApi: {
      createRemoteApiClient: typeof createRemoteApiClient;
      createDocumentRepository: typeof createDocumentRepository;
      createMessageRepository: typeof createMessageRepository;
      createContactRepository: typeof createContactRepository;
      guestSessionStore: typeof guestSessionStore;
      repositoriesFor: typeof repositoriesFor;
      servicesFor: typeof servicesFor;
      placeOf: typeof placeOf;
      parseMessageContent: typeof parseMessageContent;
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
  window.folderShareService = folderShareService;
  window.cryptoService = cryptoService;
  window.publicProfileService = publicProfileService;
  window.handlePush = handlePush;
  window.notificationStore = notificationStore;
  window.notificationKeyringService = notificationKeyringService;
  window.pushSubscriptionService = pushSubscriptionService;
  window.pushSubscriptionRepository = pushSubscriptionRepository;
  window.resetPushEnabled = resetPushEnabled;
  window.createTranslator = createTranslator;
  window.federation = {
    federationRepository,
    createFederationGuestTokenProvider,
  };
  window.remoteApi = {
    createRemoteApiClient,
    createDocumentRepository,
    createMessageRepository,
    createContactRepository,
    guestSessionStore,
    repositoriesFor,
    servicesFor,
    placeOf,
    parseMessageContent,
    setGuestTokenProvider,
    FederationUnavailableError,
  };
}

registerServiceWorker();
capturePendingFederatedInvitation();

initAppName().then(() => {
  document.title = getAppName();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
