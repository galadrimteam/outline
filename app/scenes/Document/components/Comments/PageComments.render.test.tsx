import { runInAction } from "mobx";
import { Provider } from "mobx-react";
import { Schema } from "prosemirror-model";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import type { DatabasePageDiscussions } from "@shared/databases/types";
import { light } from "@shared/styles/theme";
import { ProsemirrorHelper } from "@shared/utils/ProsemirrorHelper";
import {
  DocumentContextProvider,
  useDocumentContext,
} from "~/components/DocumentContext";
import type { Editor } from "~/editor";
import { ActionContextProvider } from "~/hooks/useActionContext";
import stores from "~/stores";
import { PageComments } from "./PageComments";

const me = "00000000-0000-4000-8000-0000000000a1";
const thomas = "00000000-0000-4000-8000-0000000000a2";
const teamId = "00000000-0000-4000-8000-0000000000a3";
const documentId = "00000000-0000-4000-8000-0000000000a4";
const open = "00000000-0000-4000-8000-0000000000b1";
const resolved = "00000000-0000-4000-8000-0000000000b2";
const anchored = "00000000-0000-4000-8000-0000000000b3";
const databaseId = "00000000-0000-4000-8000-0000000000a5";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*" },
    text: {},
  },
  marks: { comment: { attrs: { id: {}, userId: { default: "" } } } },
});

/** A document whose only passage carries the comment mark of `anchored`. */
const doc = schema.node("doc", null, [
  schema.node("paragraph", null, [
    schema.text("Le passage", [schema.marks.comment.create({ id: anchored })]),
  ]),
]);

function WithEditor() {
  const context = useDocumentContext();
  useEffect(() => {
    const editor = {
      view: { state: { doc } },
      getHeadings: () => [],
      getTasks: () => [],
      getComments: () => ProsemirrorHelper.getComments(doc),
      updateComment: () => undefined,
      removeComment: () => undefined,
    };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    context.setEditor(editor as unknown as Editor);
  }, [context]);
  const document = stores.documents.get(documentId);
  return document ? <PageComments document={document} /> : null;
}

const comment = (
  id: string,
  createdById: string,
  createdAt: string,
  patch: Record<string, unknown> = {}
) =>
  stores.comments.add({
    id,
    documentId,
    createdById,
    createdAt,
    updatedAt: createdAt,
    parentCommentId: null,
    data: { type: "doc", content: [] },
    reactions: [],
    ...patch,
  });

describe("PageComments", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    // jsdom has no ResizeObserver, which the thread's resizing containers use.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    stores.comments.clear();
    stores.users.add({ id: me, name: "Maceo", language: "fr_FR" });
    stores.users.add({ id: thomas, name: "Thomas" });
    stores.auth.add({ id: teamId, name: "Galadrim", preferences: {} });
    stores.documents.remove(documentId);
    runInAction(() => {
      stores.auth.currentUserId = me;
      stores.auth.currentTeamId = teamId;
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    stores.ui.setRightSidebar(null);
  });

  function allow(comment: boolean) {
    stores.policies.add({
      id: documentId,
      abilities: { read: true, comment, update: comment },
    });
  }

  /** A plain page, or a row of a database with these « Page discussions ». */
  function page(discussions?: DatabasePageDiscussions | "unset") {
    if (!discussions) {
      stores.documents.add({ id: documentId, title: "Ticket" });
      return;
    }
    stores.databases.add({
      id: databaseId,
      title: "Suivi",
      settings: {
        pageLayout: discussions === "unset" ? {} : { discussions },
      },
    });
    stores.documents.add({
      id: documentId,
      title: "Ticket",
      databaseId,
      databaseRecordId: "rec1",
    });
  }

  async function render() {
    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <ActionContextProvider>
                <DocumentContextProvider>
                  <WithEditor />
                </DocumentContextProvider>
              </ActionContextProvider>
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });
  }

  const section = () => container.querySelector("section");
  const threads = () => container.querySelectorAll("[data-comment-thread]");
  const lastIsForm = () =>
    section()?.lastElementChild?.tagName === "FORM" &&
    !section()?.lastElementChild?.closest("[data-comment-thread]");

  it("shows the open threads of the page, not the resolved nor the anchored ones", async () => {
    page("expanded");
    allow(true);
    comment(open, thomas, "2025-11-13T09:20:21.340Z");
    comment(resolved, me, "2025-10-23T15:10:51.180Z", {
      resolvedAt: "2025-11-04T09:25:18.069Z",
      resolvedById: me,
    });
    comment(anchored, me, "2025-10-24T13:59:24.948Z");
    await render();

    expect(section()?.getAttribute("aria-label")).toBe("Comments");
    expect(threads()).toHaveLength(1);
    expect(threads()[0].textContent).toContain("Thomas");
    expect(lastIsForm()).toBe(true);
  });

  it("dates a comment by its day, as Notion's « 13/11/2025 »", async () => {
    page();
    allow(true);
    comment(open, thomas, "2025-11-13T09:20:21.340Z");
    await render();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(threads()[0].textContent).toContain("13/11/2025");
    expect(threads()[0].textContent).not.toContain("il y a");
  });

  const thread = (replies: number) => {
    comment(open, thomas, "2025-06-13T08:54:27.033Z");
    for (let index = 1; index <= replies; index++) {
      comment(
        `00000000-0000-4000-8000-0000000000c${index}`,
        index % 2 ? me : thomas,
        `2025-07-2${index}T16:32:03.000Z`,
        { parentCommentId: open }
      );
    }
  };

  it("shows a thread of two replies in full, every comment with its author", async () => {
    page();
    allow(true);
    thread(2);
    await render();

    expect(threads()[0].textContent).not.toContain("Show");
    expect(threads()[0].textContent?.match(/Thomas/g)).toHaveLength(2);
  });

  it("folds a thread from its third reply on to its first and last comments, like Notion", async () => {
    page();
    allow(true);
    thread(3);
    await render();

    expect(threads()).toHaveLength(1);
    expect(threads()[0].textContent).toContain("Show 2");
  });

  it("replies in place: a click opens the reply form, not the sidebar", async () => {
    page("expanded");
    allow(true);
    comment(open, thomas, "2025-11-13T09:20:21.340Z");
    await render();
    const thread = threads()[0];
    expect(thread.querySelectorAll("form")).toHaveLength(1);

    await act(async () => {
      thread.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(thread.querySelectorAll("form")).toHaveLength(2);
    expect(stores.ui.rightSidebar).toBe(null);
  });

  it("offers to start a discussion on a row whose database shows them expanded", async () => {
    page("expanded");
    allow(true);
    await render();

    expect(threads()).toHaveLength(0);
    expect(lastIsForm()).toBe(true);
  });

  it("shows only the discussions there are on a row whose database keeps them minimal, Notion's default", async () => {
    page("unset");
    allow(true);
    await render();
    expect(section()).toBe(null);

    comment(open, thomas, "2025-11-13T09:20:21.340Z");
    await render();
    expect(threads()).toHaveLength(1);
    expect(lastIsForm()).toBe(false);
  });

  it("shows nothing on a row whose database turns them off", async () => {
    page("off");
    allow(true);
    comment(open, thomas, "2025-11-13T09:20:21.340Z");
    await render();

    expect(section()).toBe(null);
  });

  it("shows nothing on a plain page without discussion, nor to a reader who cannot comment", async () => {
    page();
    allow(true);
    await render();
    expect(section()).toBe(null);

    page("expanded");
    allow(false);
    await render();
    expect(section()).toBe(null);
  });

  it("shows the form, focused and in view, when the page is asked to", async () => {
    page("unset");
    allow(true);
    await render();
    expect(section()).toBe(null);

    await act(async () => {
      stores.ui.setPageCommentsRequest("rec-other");
    });
    expect(section()).toBe(null);

    await act(async () => {
      stores.ui.setPageCommentsRequest(documentId);
    });
    expect(lastIsForm()).toBe(true);
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(
      1
    );
    expect(stores.ui.pageCommentsRequest).toBe(null);
  });

  it("shows the threads but no form to a reader who cannot comment", async () => {
    page("expanded");
    allow(false);
    comment(open, thomas, "2025-11-13T09:20:21.340Z");
    await render();

    expect(threads()).toHaveLength(1);
    expect(lastIsForm()).toBe(false);
  });
});
