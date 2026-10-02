import { createRef } from "react";
import i18next from "i18next";
import type { TFunction } from "i18next";
import embeds, { EmbedDescriptor } from "@shared/editor/embeds";
import type { MenuItem } from "@shared/editor/types";
import en_US from "../../../shared/i18n/locales/en_US/translation.json";
import fr_FR from "../../../shared/i18n/locales/fr_FR/translation.json";
import blockMenuItems from "./block";
import { matchesMenuSearch, menuSearchScore } from "./search";

const i18n = i18next.createInstance();
void i18n.init({
  initImmediate: false,
  resources: {
    en: { translation: en_US },
    fr: { translation: fr_FR },
  },
  lng: "en",
  keySeparator: false,
  nsSeparator: false,
  compatibilityJSON: "v3",
});

const actions = {
  createSubPage: () => undefined,
  commentBlock: () => undefined,
  highlightBlock: () => undefined,
};

/**
 * Lists the titles the « / » menu shows for a search, best first, as
 * SuggestionsMenu does with the block items followed by the embeds.
 */
function search(t: TFunction, query: string): string[] {
  const items: (MenuItem | EmbedDescriptor)[] = [
    ...blockMenuItems(t, createRef<HTMLDivElement>(), actions),
    ...embeds.filter((embed) => embed.title),
  ];
  return items
    .filter(
      (item) =>
        item.name !== "separator" &&
        item.visible !== false &&
        matchesMenuSearch(item, query)
    )
    .map((item, index) => ({
      title: item.title ?? "",
      index,
      score: menuSearchScore(item, query, {
        embed: item instanceof EmbedDescriptor,
      }),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ title }) => title);
}

/** What a Notion user types, and the item the menu must put first. */
const commands: [string, string[]][] = [
  ["Text", ["texte", "text", "paragraphe"]],
  ["Page", ["page", "sous-page", "subpage"]],
  [
    "Todo list",
    [
      "todo",
      "to-do",
      "tâche",
      "tache",
      "case à cocher",
      "checkbox",
      "liste de tâches",
      "to-do list",
    ],
  ],
  ["Big heading", ["h1", "titre 1", "titre1", "heading 1", "heading1"]],
  ["Medium heading", ["h2", "titre 2", "heading 2", "sous-titre"]],
  ["Small heading", ["h3", "titre 3", "heading 3"]],
  ["Extra small heading", ["h4", "titre 4"]],
  ["Table", ["tableau", "table", "tableau simple"]],
  [
    "Bulleted list",
    ["liste à puces", "liste a puces", "puces", "bullet", "bulleted list"],
  ],
  [
    "Ordered list",
    ["liste numérotée", "numerotee", "num", "numbered", "numbered list", "ol"],
  ],
  ["Toggle block", ["toggle", "bascule", "liste à bascule", "toggle list"]],
  [
    "Big toggle heading",
    ["titre 1 à bascule", "toggle heading 1", "toggle h1"],
  ],
  ["Medium toggle heading", ["titre 2 à bascule", "toggle heading 2"]],
  ["Small toggle heading", ["titre 3 à bascule", "toggle heading 3"]],
  ["Quote", ["citation", "quote"]],
  ["Divider", ["séparateur", "separateur", "divider", "div", "hr", "---"]],
  ["Link to page", ["lien vers une page", "link to page", "lien"]],
  ["Callout", ["encadré", "encadre", "callout"]],
  ["Code block", ["code"]],
  [
    "Database – inline",
    ["base de données", "base de donnees", "database", "db", "bdd"],
  ],
  [
    "Database – full page",
    ["base de données pleine page", "database full page"],
  ],
  ["Linked view of a database", ["vue liée", "linked view"]],
  ["Table view", ["vue tableau", "table view"]],
  ["Board view", ["tableau kanban", "kanban", "board", "board view"]],
  ["List view", ["vue liste", "list view"]],
  ["Gallery view", ["galerie", "gallery"]],
  ["Calendar view", ["calendrier", "calendar"]],
  ["Timeline view", ["chronologie", "timeline"]],
  ["Image", ["image", "img", "photo"]],
  ["Video", ["vidéo", "video"]],
  ["Audio", ["audio", "son"]],
  ["File attachment", ["fichier", "file", "pièce jointe"]],
  ["Embed PDF", ["pdf"]],
  ["Web bookmark", ["signet", "signet web", "bookmark", "web bookmark"]],
  ["Math block (LaTeX)", ["équation de bloc", "block equation", "latex"]],
  ["Inline equation", ["équation en ligne", "inline equation", "inline math"]],
  [
    "Current date",
    ["date", "aujourd'hui", "aujourd’hui", "today", "rappel", "reminder"],
  ],
  ["Mention a person", ["mention", "personne", "mentionner une personne"]],
  ["Emoji", ["emoji", "émoji", "smiley"]],
  ["Comment", ["commentaire", "comment"]],
  ["Red background", ["fond rouge", "rouge", "red background", "red"]],
  ["Gray background", ["fond gris", "gris", "gray background"]],
  ["Blue background", ["fond bleu", "bleu", "blue background"]],
  ["Default background", ["fond par défaut", "default background"]],
  ["Mermaid Diagram", ["mermaid"]],
];

describe.each([
  ["English", "en"],
  ["French", "fr"],
])("the « / » menu with the interface in %s", (_language, lng) => {
  const t = i18n.getFixedT(lng);

  it.each(commands)(
    "puts « %s » first for what a Notion user types",
    (expected, queries) => {
      for (const query of queries) {
        expect([query, search(t, query)[0]]).toEqual([query, t(expected)]);
      }
    }
  );

  it("puts the generic embed first for « intégrer » and « embed »", () => {
    for (const query of ["intégrer", "integrer", "intégration", "embed"]) {
      expect([query, search(t, query)[0]]).toEqual([query, "Embed"]);
    }
  });

  it("lists a block of the editor before an embed answering as well", () => {
    expect(search(t, "calendar")[0]).toBe(t("Calendar view"));
    expect(search(t, "code")[0]).toBe(t("Code block"));
    expect(search(t, "youtube")[0]).toBe("YouTube");
  });

  it("lists the blocks a « turn into » can make", () => {
    const titles = search(t, "transformer en");
    for (const expected of [
      "Text",
      "Big heading",
      "Todo list",
      "Bulleted list",
      "Ordered list",
      "Toggle block",
      "Quote",
      "Code block",
      "Callout",
    ]) {
      expect(titles).toContain(t(expected));
    }
    expect(search(t, "turn into")).toEqual(titles);
  });

  it("offers nothing for the blocks Outline does not have", () => {
    for (const query of [
      "2 colonnes",
      "colonnes",
      "table des matières",
      "bloc synchronisé",
      "fil d'ariane",
      "bouton",
    ]) {
      expect([query, search(t, query)]).toEqual([query, []]);
    }
  });

  it("keeps the colours out of the menu until something is typed", () => {
    const items = blockMenuItems(t, createRef<HTMLDivElement>(), actions);
    const colours = items.filter((item) => item.defaultHidden);
    expect(colours.map((item) => item.title)).toContain(t("Red background"));
  });
});

describe("blockMenuItems", () => {
  it("leaves out what the editor cannot do", () => {
    const t = i18n.getFixedT("en");
    const visible = blockMenuItems(t, createRef<HTMLDivElement>())
      .filter((item) => item.visible !== false)
      .map((item) => item.title);
    expect(visible).not.toContain("Page");
    expect(visible).not.toContain("Comment");
    expect(visible).not.toContain("Red background");
  });

  it("makes a link mention of a web bookmark", () => {
    const t = i18n.getFixedT("en");
    const bookmark = blockMenuItems(t, createRef<HTMLDivElement>()).find(
      (item) => item.title === "Web bookmark"
    );
    expect(bookmark?.fromLink?.("not a link")).toBeUndefined();
    expect(bookmark?.fromLink?.("https://www.notion.so")?.attrs).toMatchObject({
      type: "url",
      href: "https://www.notion.so",
    });
  });
});
