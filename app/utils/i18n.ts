import i18n from "i18next";
import backend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";
import { languages } from "@shared/i18n";
import { unicodeCLDRtoBCP47, unicodeBCP47toCLDR } from "@shared/utils/date";
import { isRTLLanguage } from "@shared/utils/rtl";
import { cdnPath } from "@shared/utils/urls";
import Logger from "./Logger";

/**
 * galadrim: a hash of the translation files, put in the URL they are fetched
 * from. The server serves `/locales/<lng>.json` with a seven day max-age and
 * nothing in the URL to tell two builds apart, so a browser that loaded the
 * app before a deploy kept the previous translations for up to a week: every
 * string the fork had just added showed in English (its source) in the middle
 * of a French page — "Edited il y a 18 heures" in the header of every
 * document, for one. The hash is computed at build time by vite.config.ts, so
 * it cannot be forgotten when a string is added; outside a Vite build (tests,
 * the dev server) there is nothing to bust.
 */
const translationsVersion = process.env.TRANSLATIONS_VERSION ?? "dev";

/**
 * The URL the translations of a language are loaded from.
 *
 * @param locale The BCP47 locale, as i18next hands it over.
 * @returns The path of that language's translation file.
 */
export function translationsPath(locale: string): string {
  return cdnPath(
    `/locales/${unicodeBCP47toCLDR(locale)}.json?v=${translationsVersion}`
  );
}

/**
 * Initializes i18n library, loading all available translations from the
 * API backend.
 *
 * @param defaultLanguage The default language to use if the user's language
 * is not supported.
 * @returns A promise resolving to the i18n instance
 */
export function initI18n(defaultLanguage = "en_US") {
  const lng = unicodeCLDRtoBCP47(defaultLanguage);

  if (typeof document !== "undefined") {
    document.documentElement.dir = isRTLLanguage(defaultLanguage)
      ? "rtl"
      : "ltr";
  }

  void i18n
    .use(backend)
    .use(initReactI18next)
    .init({
      compatibilityJSON: "v3",
      backend: {
        // this must match the path defined in routes. It's the path that the
        // frontend UI code will hit to load missing translations.
        loadPath: (locale: string[]) => translationsPath(locale[0]),
      },
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
      lng,
      fallbackLng: lng,
      supportedLngs: languages.map(unicodeCLDRtoBCP47),
      keySeparator: false,
      returnNull: false,
    })
    .catch((err) => {
      Logger.error("Failed to initialize i18n", err);
    });

  return i18n;
}
