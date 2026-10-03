import { runInAction } from "mobx";
import { Provider } from "mobx-react";
import { Schema } from "prosemirror-model";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
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

function WithEditor({ showEmpty }: { showEmpty?: boolean }) {
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
  return document ? (
    <PageComments document={document} showEmpty={showEmpty} />
  ) : null;
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
    stores.comments.clear();
    stores.users.add({ id: me, name: "Maceo" });
    stores.users.add({ id: thomas, name: "Thomas" });
    stores.auth.add({ id: teamId, name: "Galadrim", preferences: {} });
    stores.documents.add({ id: documentId, title: "Ticket", teamId });
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

  async function render(showEmpty?: boolean) {
    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <ActionContextProvider>
                <DocumentContextProvider>
                  <WithEditor showEmpty={showEmpty} />
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

  it("shows the open threads of the page, not the resolved nor the anchored ones", async () => {
    allow(true);
    comment(open, thomas, "2025-11-13T09:20:21.340Z");
    comment(resolved, me, "2025-10-23T15:10:51.180Z", {
      resolvedAt: "2025-11-04T09:25:18.069Z",
      resolvedById: me,
    });
    comment(anchored, me, "2025-10-24T13:59:24.948Z");
    await render(true);

    expect(section()?.getAttribute("aria-label")).toBe("Comments");
    expect(threads()).toHaveLength(1);
    expect(threads()[0].textContent).toContain("Thomas");
    expect(section()?.lastElementChild?.tagName).toBe("FORM");
    expect(section()?.lastElementChild?.closest("[data-comment-thread]")).toBe(
      null
    );
  });

  it("folds a thread of three comments to its first and last ones, like Notion", async () => {
    allow(true);
    comment(open, thomas, "2025-06-13T08:54:27.033Z");
    comment(
      "00000000-0000-4000-8000-0000000000c1",
      me,
      "2025-07-21T16:32:03Z",
      {
        parentCommentId: open,
      }
    );
    comment(
      "00000000-0000-4000-8000-0000000000c2",
      thomas,
      "2025-08-05T09:45:43Z",
      {
        parentCommentId: open,
      }
    );
    await render(true);

    expect(threads()).toHaveLength(1);
    expect(threads()[0].textContent).toContain("Show 1 reply");
  });

  it("replies in place: a click opens the reply form, not the sidebar", async () => {
    allow(true);
    comment(open, thomas, "2025-11-13T09:20:21.340Z");
    await render(true);
    const thread = threads()[0];
    expect(thread.querySelectorAll("form")).toHaveLength(1);

    await act(async () => {
      thread.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(thread.querySelectorAll("form")).toHaveLength(2);
    expect(stores.ui.rightSidebar).toBe(null);
  });

  it("offers to start a discussion on a database row that has none", async () => {
    allow(true);
    await render(true);

    expect(threads()).toHaveLength(0);
    expect(section()?.querySelector("form")).not.toBe(null);
  });

  it("shows nothing on a plain page without discussion, nor to a reader who cannot comment", async () => {
    allow(true);
    await render(false);
    expect(section()).toBe(null);

    allow(false);
    await render(true);
    expect(section()).toBe(null);
  });

  it("shows the threads but no form to a reader who cannot comment", async () => {
    allow(false);
    comment(open, thomas, "2025-11-13T09:20:21.340Z");
    await render(true);

    expect(threads()).toHaveLength(1);
    expect(
      section()?.lastElementChild?.closest("[data-comment-thread]")
    ).not.toBe(null);
  });
});
