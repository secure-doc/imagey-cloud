import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { getAppName, initAppName } from "./utils/appName.ts";

initAppName().then(() => {
  document.title = getAppName();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
