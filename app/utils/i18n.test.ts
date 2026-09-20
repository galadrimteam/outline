import i18n from "i18next";
import de_DE from "../../shared/i18n/locales/de_DE/translation.json";
import en_US from "../../shared/i18n/locales/en_US/translation.json";
import fr_FR from "../../shared/i18n/locales/fr_FR/translation.json";
import pt_PT from "../../shared/i18n/locales/pt_PT/translation.json";
import { translationsPath } from "./i18n";

// i18n is already initialized globally via app/test/setup.ts — only add
// test resources here, without re-initializing the singleton.
beforeAll(() => {
  i18n
    .addResources("en-US", "translation", en_US)
    .addResources("de-DE", "translation", de_DE)
    .addResources("pt-PT", "translation", pt_PT);
});

describe("translationsPath", () => {
  // galadrim: the locale files are served with a seven day max-age, so a
  // browser that loaded the app before a deploy keeps them. Without a version
  // in the URL every string the fork has just added shows in English in the
  // middle of a French page.
  it("carries a version, so a deploy is not served the previous strings", () => {
    expect(translationsPath("fr-FR")).toMatch(/^\/locales\/fr_FR\.json\?v=.+$/);
  });

  it("is what i18next loads the translations from", () => {
    const loadPath = (
      i18n.options.backend as { loadPath: (locale: string[]) => string }
    ).loadPath;

    expect(loadPath(["fr-FR"])).toBe(translationsPath("fr-FR"));
  });

  // Every string the fork adds has to reach fr_FR as well: French is the
  // language of the workspace, and an untranslated key falls back to English.
  it("has a French translation for the strings the fork added", () => {
    for (const key of ["Edited", "Last edited", "Copy link"]) {
      expect(fr_FR).toHaveProperty([key]);
    }
  });
});

describe("i18n env is unset", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  it("translation of key should match", () =>
    expect(i18n.t("Saving")).toBe("Saving"));

  it("translation if changed to de-DE", async () => {
    await i18n.changeLanguage("de-DE");
    expect(i18n.t("Saving")).toBe("Speichert");
  });

  it("translation if changed to pt-PT", async () => {
    await i18n.changeLanguage("pt-PT");
    expect(i18n.t("Saving")).toBe("A guardar");
  });
});

describe("i18n env is en-US", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  it("translation of key should match", () =>
    expect(i18n.t("Saving")).toBe("Saving"));

  it("translation if changed to de-DE", async () => {
    await i18n.changeLanguage("de-DE");
    expect(i18n.t("Saving")).toBe("Speichert");
  });

  it("translation if changed to pt-PT", async () => {
    await i18n.changeLanguage("pt-PT");
    expect(i18n.t("Saving")).toBe("A guardar");
  });
});

describe("i18n env is de-DE", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("de-DE");
  });

  it("translation of key should match", () =>
    expect(i18n.t("Saving")).toBe("Speichert"));

  it("translation if changed to en-US", async () => {
    await i18n.changeLanguage("en-US");
    expect(i18n.t("Saving")).toBe("Saving");
  });

  it("translation if changed to pt-PT", async () => {
    await i18n.changeLanguage("pt-PT");
    expect(i18n.t("Saving")).toBe("A guardar");
  });
});

describe("i18n env is pt-PT", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("pt-PT");
  });

  it("translation of key should match", () =>
    expect(i18n.t("Saving")).toBe("A guardar"));

  it("translation if changed to en-US", async () => {
    await i18n.changeLanguage("en-US");
    expect(i18n.t("Saving")).toBe("Saving");
  });

  it("translation if changed to de-DE", async () => {
    await i18n.changeLanguage("de-DE");
    expect(i18n.t("Saving")).toBe("Speichert");
  });
});
