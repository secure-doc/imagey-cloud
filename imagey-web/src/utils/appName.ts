import { apiFetch } from "./apiFetch";

let appName = "Documents";

export async function initAppName(): Promise<void> {
  try {
    const response = await apiFetch("/manifest.json");
    if (response.ok) {
      const manifest = await response.json();
      if (manifest && manifest.short_name) {
        appName = manifest.short_name;
      }
    }
  } catch (error) {
    console.error("Failed to load manifest:", error);
  }
}

export function getAppName(): string {
  return appName;
}
