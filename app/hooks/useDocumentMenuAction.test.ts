import {
  archiveDocument,
  copyDocument,
  copyDocumentLink,
  createNewDocument,
  createTemplateFromDocument,
  editDocument,
  openDocumentInSplit,
  pinDocument,
  shareDocument,
  unpublishDocument,
} from "~/actions/definitions/documents";
import type { ActionVariant } from "~/types";
import {
  contextMenuEntries,
  documentMenuEntries,
  pageMenuEntries,
} from "./useDocumentMenuAction";

const stub = (name: string) =>
  ({
    id: name,
    name,
    type: "action",
    variant: "action",
    section: "Documents",
    perform: () => undefined,
  }) as unknown as ActionVariant;

const parts = {
  findAndReplace: stub("find-and-replace"),
  rename: stub("rename"),
  applyTemplate: stub("apply-template"),
  isViewing: true,
};

/** The actions a menu is built of, separators and groups dropped. */
const actionsOf = (entries: ReturnType<typeof pageMenuEntries>) =>
  entries.filter((entry): entry is ActionVariant => entry.type === "action");

/** The entries Notion's page menu has no equivalent for. */
const outlineOnly = [
  editDocument,
  shareDocument,
  createTemplateFromDocument,
  unpublishDocument,
  archiveDocument,
  createNewDocument,
  pinDocument,
  openDocumentInSplit,
];

describe("pageMenuEntries", () => {
  it("leaves out the entries a Notion page menu does not have", () => {
    const actions = actionsOf(pageMenuEntries(parts));

    for (const action of outlineOnly) {
      expect(actions).not.toContain(action);
    }
  });

  it("offers 'Copy link' once, not also inside the 'Copy' submenu", () => {
    const actions = actionsOf(pageMenuEntries(parts));
    const withLinkName = actions.filter(
      (action) => action.name === copyDocumentLink.name
    );
    const copy = actions.find((action) => action.name === copyDocument.name);

    expect(withLinkName).toHaveLength(1);
    expect(copy?.variant).toBe("action_with_children");

    const children =
      copy?.variant === "action_with_children" && Array.isArray(copy.children)
        ? copy.children
        : [];
    expect(children.length).toBeGreaterThan(0);
    expect(children).not.toContain(copyDocumentLink);
  });
});

describe("contextMenuEntries", () => {
  it("keeps the upstream entries: the sidebar and the document lists are the only route to them for a document one is not viewing", () => {
    const actions = actionsOf(contextMenuEntries(parts));

    for (const action of [...outlineOnly, copyDocument]) {
      expect(actions).toContain(action);
    }
  });

  it("offers more than the menu of the page itself", () => {
    expect(actionsOf(contextMenuEntries(parts)).length).toBeGreaterThan(
      actionsOf(pageMenuEntries(parts)).length
    );
  });
});

describe("documentMenuEntries", () => {
  it("is the upstream menu unless the page menu is asked for by name", () => {
    // Every caller but the header of the document being viewed leaves the
    // variant unset — the sidebar, the starred links, the document lists, the
    // breadcrumb and the references — and none of them may lose an entry.
    expect(documentMenuEntries(undefined, parts)).toEqual(
      contextMenuEntries(parts)
    );
    expect(documentMenuEntries("context", parts)).toEqual(
      contextMenuEntries(parts)
    );
    expect(documentMenuEntries("page", parts)).toEqual(pageMenuEntries(parts));
  });
});
