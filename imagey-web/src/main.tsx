import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { getAppName, initAppName } from "./utils/appName.ts";

import { contactService } from "./contact/ContactService";
import { deviceService } from "./device/DeviceService";
import { documentService } from "./document/DocumentService";
import { cryptoService } from "./authentication/CryptoService";
import { publicProfileService } from "./profile/publicProfileService";

declare global {
  interface Window {
    contactService: typeof contactService;
    deviceService: typeof deviceService;
    documentService: typeof documentService;
    cryptoService: typeof cryptoService;
    publicProfileService: typeof publicProfileService;
  }
}

if (import.meta.env.DEV) {
  window.contactService = contactService;
  window.deviceService = deviceService;
  window.documentService = documentService;
  window.cryptoService = cryptoService;
  window.publicProfileService = publicProfileService;
}

initAppName().then(() => {
  document.title = getAppName();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
