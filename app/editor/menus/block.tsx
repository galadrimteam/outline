import {
  BlockQuoteIcon,
  BulletedListIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  HorizontalRuleIcon,
  OrderedListIcon,
  PageBreakIcon,
  PDFIcon,
  TableIcon,
  TodoListIcon,
  ImageIcon,
  StarredIcon,
  WarningIcon,
  InfoIcon,
  AttachmentIcon,
  CalendarIcon,
  MathIcon,
  DoneIcon,
  EmbedIcon,
  CollapseIcon,
  DatabaseIcon,
  LinkIcon,
  CaseSensitiveIcon,
  NewDocumentIcon,
  GoToIcon,
  UserIcon,
  SmileyIcon,
  BookmarkIcon,
  LightBulbIcon,
  CommentIcon,
} from "outline-icons";
import * as React from "react";
import styled from "styled-components";
import { v4 as uuidv4 } from "uuid";
import type { TFunction } from "i18next";
import Image from "@shared/editor/components/Img";
import type { MenuItem } from "@shared/editor/types";
import { DatabaseLayout } from "@shared/databases/types";
import { MentionType } from "@shared/types";
import { toISODate } from "@shared/utils/date";
import { metaDisplay } from "@shared/utils/keyboard";
import { isUrl } from "@shared/utils/urls";
import { LayoutIcon } from "~/components/Database/LayoutIcon";
import { pendingDatabases } from "~/components/Database/pendingDatabases";
import CircleIcon from "~/components/Icons/CircleIcon";
import { DottedCircleIcon } from "~/components/Icons/DottedCircleIcon";
import Desktop from "~/utils/Desktop";

/**
 * What the block menu does beyond running an editor command, given by the
 * host editor. An item whose action is missing is not offered.
 */
export interface BlockMenuActions {
  /** Creates a page nested under the current one, links it at the cursor and opens it. */
  createSubPage?: () => void;
  /** Opens a comment on the block holding the cursor. */
  commentBlock?: () => void;
  /** Paints the text of the block holding the cursor, or clears it with null. */
  highlightBlock?: (color: string | null) => void;
}

const Img = styled(Image)`
  border-radius: 2px;
  background: #fff;
  box-shadow: 0 0 0 1px #fff;
  margin: 4px;
  width: 18px;
  height: 18px;
`;

/**
 * The items of the « / » menu. Their keywords hold the English and French
 * names and the abbreviations Notion's menu answers to, so that a block is
 * found under the word a Notion user types whatever the interface language.
 *
 * @param t the translation function.
 * @param documentRef the element of the document, to size new tables.
 * @param actions what the menu does beyond editor commands.
 * @returns the menu items.
 */
export default function blockMenuItems(
  t: TFunction,
  documentRef: React.RefObject<HTMLDivElement>,
  actions: BlockMenuActions = {}
): MenuItem[] {
  const documentWidth = documentRef.current?.clientWidth ?? 0;
  const turnInto = "turn into transformer en convertir";

  const items: MenuItem[] = [
    {
      name: "paragraph",
      title: t("Text"),
      icon: <CaseSensitiveIcon />,
      keywords: `text texte paragraph paragraphe plain normal body corps ${turnInto}`,
    },
    {
      name: "noop",
      title: t("Page"),
      icon: <NewDocumentIcon />,
      keywords:
        "page subpage sub-page sous-page nested imbriquée new nouvelle document doc",
      visible: !!actions.createSubPage,
      onClick: actions.createSubPage,
    },
    {
      name: "document-menu",
      title: t("Link to page"),
      icon: <GoToIcon />,
      keywords:
        "link to page lien vers une page la mention mentionner existing existante document doc",
    },
    {
      name: "separator",
    },
    {
      name: "heading",
      title: t("Big heading"),
      keywords: `h1 heading1 heading 1 title header titre1 titre 1 grand ${turnInto}`,
      icon: <Heading1Icon />,
      shortcut: "^ ⇧ 1",
      attrs: { level: 1 },
    },
    {
      name: "heading",
      title: t("Medium heading"),
      keywords: `h2 heading2 heading 2 header subtitle titre2 titre 2 sous-titre moyen ${turnInto}`,
      icon: <Heading2Icon />,
      shortcut: "^ ⇧ 2",
      attrs: { level: 2 },
    },
    {
      name: "heading",
      title: t("Small heading"),
      keywords: `h3 heading3 heading 3 header titre3 titre 3 petit ${turnInto}`,
      icon: <Heading3Icon />,
      shortcut: "^ ⇧ 3",
      attrs: { level: 3 },
    },
    {
      name: "heading",
      title: t("Extra small heading"),
      keywords: `h4 heading4 heading 4 header titre4 titre 4 ${turnInto}`,
      icon: <Heading4Icon />,
      shortcut: "^ ⇧ 4",
      attrs: { level: 4 },
    },
    {
      name: "separator",
    },
    {
      name: "checkbox_list",
      title: t("Todo list"),
      icon: <TodoListIcon />,
      keywords: `todo to-do todos checklist checkbox task tasks tâche tâches liste de tâches case à cocher ${turnInto}`,
      shortcut: "^ ⇧ 7",
    },
    {
      name: "bullet_list",
      title: t("Bulleted list"),
      icon: <BulletedListIcon />,
      keywords: `bullet bullets bulleted list ul unordered dash point puce puces liste à puces ${turnInto}`,
      shortcut: "^ ⇧ 8",
    },
    {
      name: "ordered_list",
      title: t("Ordered list"),
      icon: <OrderedListIcon />,
      keywords: `ol numbered number num ordered list liste numérotée numéros ${turnInto}`,
      shortcut: "^ ⇧ 9",
    },
    {
      name: "separator",
    },
    {
      name: "image",
      title: t("Image"),
      icon: <ImageIcon />,
      keywords: "image picture photo img upload png jpg gif screenshot capture",
    },
    {
      name: "video",
      title: t("Video"),
      icon: <EmbedIcon />,
      keywords: "video vidéo movie avi mp4 film upload player",
    },
    {
      name: "attachment",
      title: t("Audio"),
      icon: <AttachmentIcon />,
      keywords:
        "audio sound son music musique mp3 wav m4a recording enregistrement",
      attrs: { accept: "audio/*" },
    },
    {
      name: "attachment",
      title: t("Embed PDF"),
      icon: <PDFIcon />,
      keywords: "pdf document upload attach",
      attrs: {
        accept: "application/pdf",
        preview: true,
      },
    },
    {
      name: "attachment",
      title: t("File attachment"),
      icon: <AttachmentIcon />,
      keywords:
        "file fichier upload attach attachment pièce jointe pj document",
    },
    {
      name: "mention",
      title: t("Web bookmark"),
      icon: <BookmarkIcon />,
      keywords: "bookmark web signet lien link url preview aperçu",
      placeholder: `${t("Paste a link")}…`,
      fromLink: (href) =>
        isUrl(href)
          ? {
              name: "mention",
              appendSpace: true,
              attrs: {
                id: uuidv4(),
                type: MentionType.URL,
                label: href,
                href,
                modelId: uuidv4(),
              },
            }
          : undefined,
    },
    {
      name: "table",
      title: t("Table"),
      icon: <TableIcon />,
      keywords:
        "table tableau simple grid spreadsheet rows columns cells lignes cellules",
      attrs: {
        rowsCount: 3,
        colsCount: 3,
        colWidth: documentWidth / 3,
      },
    },
    {
      name: "blockquote",
      title: t("Quote"),
      icon: <BlockQuoteIcon />,
      keywords: `quote blockquote pullquote citation guillemets ${turnInto}`,
      shortcut: `${metaDisplay} ]`,
    },
    {
      name: "code_block",
      title: t("Code block"),
      icon: <CodeIcon />,
      shortcut: "^ ⇧ c",
      keywords: `code codeblock script snippet syntax pre programme ${turnInto}`,
    },
    {
      name: "math_block",
      title: t("Math block (LaTeX)"),
      icon: <MathIcon />,
      keywords:
        "math maths katex latex tex formula formule equation équation de bloc block",
    },
    {
      name: "math_inline",
      title: t("Inline equation"),
      icon: <MathIcon />,
      keywords:
        "math maths katex latex tex formula formule equation équation inline en ligne",
    },
    {
      name: "hr",
      title: t("Divider"),
      icon: <HorizontalRuleIcon />,
      shortcut: `${metaDisplay} _`,
      keywords:
        "divider div --- hr horizontal rule break line separator séparateur ligne trait",
    },
    {
      name: "hr",
      title: t("Page break"),
      icon: <PageBreakIcon />,
      keywords: "pagebreak print line saut de page impression",
      attrs: { markup: "***" },
    },
    {
      name: "mention",
      title: t("Current date"),
      keywords:
        "date today now clock time aujourd'hui maintenant jour reminder rappel",
      icon: <CalendarIcon />,
      appendSpace: true,
      attrs: () => {
        const modelId = toISODate(new Date());
        return {
          id: uuidv4(),
          type: MentionType.Date,
          modelId,
          label: modelId,
        };
      },
    },
    {
      name: "mention-menu",
      title: t("Mention a person"),
      icon: <UserIcon />,
      keywords:
        "mention a person people user member mentionner une personne utilisateur membre",
    },
    {
      name: "emoji-menu",
      title: t("Emoji"),
      icon: <SmileyIcon />,
      keywords: "emoji emojis emoticon émoticône émoji smiley icon icône",
    },
    {
      name: "separator",
    },
    ...databaseMenuItems(t),
    {
      name: "separator",
    },
    {
      name: "container_toggle",
      title: t("Toggle block"),
      icon: <CollapseIcon />,
      keywords: `toggle toggle list liste à bascule bascule collapsible collapse fold accordion details expand dérouler replier ${turnInto}`,
    },
    {
      name: "container_toggle",
      title: t("Big toggle heading"),
      icon: <Heading1Icon />,
      keywords:
        "toggle heading 1 titre 1 à bascule titre de bascule h1 collapsible collapse fold accordion details expand",
      attrs: { level: 1 },
    },
    {
      name: "container_toggle",
      title: t("Medium toggle heading"),
      icon: <Heading2Icon />,
      keywords:
        "toggle heading 2 titre 2 à bascule titre de bascule h2 collapsible collapse fold accordion details expand",
      attrs: { level: 2 },
    },
    {
      name: "container_toggle",
      title: t("Small toggle heading"),
      icon: <Heading3Icon />,
      keywords:
        "toggle heading 3 titre 3 à bascule titre de bascule h3 collapsible collapse fold accordion details expand",
      attrs: { level: 3 },
    },
    {
      name: "container_toggle",
      title: t("Extra small toggle heading"),
      icon: <Heading4Icon />,
      keywords:
        "toggle heading 4 titre 4 à bascule titre de bascule h4 collapsible collapse fold accordion details expand",
      attrs: { level: 4 },
    },
    {
      name: "separator",
    },
    {
      name: "container_notice",
      title: t("Callout"),
      icon: <LightBulbIcon />,
      keywords: `callout encadré box note card ${turnInto}`,
      attrs: { style: "default" },
    },
    {
      name: "container_notice",
      title: t("Info notice"),
      icon: <InfoIcon />,
      keywords: "card callout encadré hint information info note",
      attrs: { style: "info" },
    },
    {
      name: "container_notice",
      title: t("Success notice"),
      icon: <DoneIcon />,
      keywords: "card callout encadré hint succès",
      attrs: { style: "success" },
    },
    {
      name: "container_notice",
      title: t("Warning notice"),
      icon: <WarningIcon />,
      keywords:
        "card callout encadré hint error caution danger alert avertissement attention erreur",
      attrs: { style: "warning" },
    },
    {
      name: "container_notice",
      title: t("Tip notice"),
      icon: <StarredIcon />,
      keywords: "card callout encadré hint suggestion astuce conseil",
      attrs: { style: "tip" },
    },
    {
      name: "separator",
    },
    {
      name: "noop",
      title: t("Comment"),
      icon: <CommentIcon />,
      keywords: "comment commentaire commenter remark remarque discussion",
      visible: !!actions.commentBlock,
      onClick: actions.commentBlock,
    },
    ...backgroundMenuItems(t, actions),
    {
      name: "separator",
    },
    {
      name: "code_block",
      title: "Mermaid Diagram",
      icon: <Img src="/images/mermaidjs.png" alt="Mermaid Diagram" />,
      keywords:
        "mermaid flowchart graph sequence gantt diagram diagramme schéma",
      attrs: { language: "mermaid" },
    },
    {
      name: "editDiagram",
      title: "Diagrams.net Diagram",
      icon: <Img src="/images/diagrams.png" alt="Diagrams.net Diagram" />,
      keywords:
        "flowchart drawio draw.io whiteboard diagram diagramme schéma dessin",
    },
  ];

  // Filter out diagrams.net in desktop app
  return Desktop.isElectron()
    ? items.filter((item) => item.name !== "editDiagram")
    : items;
}

/**
 * The items that paint a block in one of Notion's background colours, listed
 * only once something is typed, as they would crowd the menu otherwise. The
 * colours are chosen so that, at the highlight's opacity, they give Notion's.
 *
 * @param t the translation function.
 * @param actions what the menu does beyond editor commands.
 * @returns the menu items.
 */
function backgroundMenuItems(
  t: TFunction,
  actions: BlockMenuActions
): MenuItem[] {
  const { highlightBlock } = actions;
  const colors: [string, string, string][] = [
    [t("Gray background"), "gray grey gris", "#DCDCD7"],
    [t("Brown background"), "brown marron", "#E4D5D5"],
    [t("Orange background"), "orange", "#F5D0AA"],
    [t("Yellow background"), "yellow jaune", "#F5E1A5"],
    [t("Green background"), "green vert", "#D2E1D0"],
    [t("Blue background"), "blue bleu", "#C3E1EE"],
    [t("Purple background"), "purple violet", "#E9E1F0"],
    [t("Pink background"), "pink rose", "#F0D5E1"],
    [t("Red background"), "red rouge", "#FFCDD0"],
  ];
  const keywords = "background fond arrière-plan color colour couleur";

  return [
    ...colors.map(([title, names, hex]) => ({
      name: "noop",
      title,
      icon: <CircleIcon retainColor color={hex} />,
      keywords: `${names} ${keywords}`,
      defaultHidden: true,
      visible: !!highlightBlock,
      onClick: () => highlightBlock?.(hex),
    })),
    {
      name: "noop",
      title: t("Default background"),
      icon: <DottedCircleIcon retainColor color="transparent" />,
      keywords: `default par défaut none aucune clear effacer ${keywords}`,
      defaultHidden: true,
      visible: !!highlightBlock,
      onClick: () => highlightBlock?.(null),
    },
  ];
}

/**
 * The block menu items that insert a database: a new one, inline or full
 * page, a linked view of an existing one, and one per layout.
 *
 * @param t the translation function.
 * @returns the menu items.
 */
function databaseMenuItems(t: TFunction): MenuItem[] {
  const insert =
    (layout: DatabaseLayout, fullPage = false) =>
    () => {
      const id = uuidv4();
      pendingDatabases.set(id, { kind: "create", layout });
      return { id, fullPage };
    };

  const layouts: [DatabaseLayout, string, string][] = [
    [
      DatabaseLayout.Table,
      t("Table view"),
      "table view vue tableau spreadsheet grid rows lignes",
    ],
    [
      DatabaseLayout.Board,
      t("Board view"),
      "board view vue tableau kanban cards columns status cartes statut",
    ],
    [
      DatabaseLayout.Calendar,
      t("Calendar view"),
      "calendar view vue calendrier dates events month mois événements agenda",
    ],
    [
      DatabaseLayout.Gallery,
      t("Gallery view"),
      "gallery view vue galerie cards grid images cartes",
    ],
    [
      DatabaseLayout.List,
      t("List view"),
      "list view vue liste rows pages lignes",
    ],
    [
      DatabaseLayout.Timeline,
      t("Timeline view"),
      "timeline view vue chronologie gantt roadmap dates frise planning",
    ],
  ];

  return [
    {
      name: "database",
      title: t("Database – inline"),
      icon: <DatabaseIcon />,
      keywords:
        "database db bdd base base de données table notion inline intégrée",
      attrs: insert(DatabaseLayout.Table),
    },
    {
      name: "database",
      title: t("Database – full page"),
      icon: <DatabaseIcon />,
      keywords:
        "database db bdd base base de données table notion page full pleine",
      attrs: insert(DatabaseLayout.Table, true),
    },
    {
      name: "database",
      title: t("Linked view of a database"),
      icon: <LinkIcon />,
      keywords:
        "database base de données linked view vue liée lien existing existante source",
      attrs: () => {
        const id = uuidv4();
        pendingDatabases.set(id, { kind: "link" });
        return { id };
      },
    },
    ...layouts.map(([layout, title, keywords]) => ({
      name: "database",
      title,
      icon: <LayoutIcon layout={layout} />,
      keywords: `database base de données ${keywords}`,
      attrs: insert(layout),
    })),
  ];
}
