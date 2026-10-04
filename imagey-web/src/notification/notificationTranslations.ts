import en from "../translation/locales/en.json";
import de from "../translation/locales/de.json";

// A minimal, dependency-free stand-in for react-i18next's `t`, for the one
// place that needs to localize text outside of React: the service worker's
// push handler (ADR 0020). Reads the very same locale files, keyed the same
// way (English text as key) - `npm run i18n:check` covers these keys too.
export type Translate = (key: string, vars?: Record<string, string>) => string;

const RESOURCES: Record<string, Record<string, string>> = {
  en: en.translation,
  de: de.translation,
};

export function createTranslator(language: string): Translate {
  const shortLanguage = language.split("-")[0];
  const dictionary = RESOURCES[shortLanguage] ?? RESOURCES.en;
  return (key, vars) => {
    let text = dictionary[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.split(`{{${name}}}`).join(value);
      }
    }
    return text;
  };
}
