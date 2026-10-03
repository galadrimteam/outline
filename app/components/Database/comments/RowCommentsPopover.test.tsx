import { runInAction } from "mobx";
import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import { light } from "@shared/styles/theme";
import { ActionContextProvider } from "~/hooks/useActionContext";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { DatabaseBlockContext } from "../DatabaseBlockContext";
import { CommentCount } from "./CommentCount";
import { rowCommentCounts } from "./rowCommentCounts";

// jsdom cannot match the :has() selectors of the comment styles on an element whose id holds
// a colon, as Radix's do: the styles of such an element are read as those of the body.
const getComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
  try {
    return getComputedStyle(element, pseudo);
  } catch {
    return getComputedStyle(document.body);
  }
}) as typeof window.getComputedStyle;

const databaseId = "30000000-0000-4000-8000-000000000031";
const documentId = "50000000-0000-4000-8000-000000000031";
const me = "60000000-0000-4000-8000-000000000031";
const thomas = "60000000-0000-4000-8000-000000000032";
const teamId = "70000000-0000-4000-8000-000000000031";
const pageThread = "80000000-0000-4000-8000-000000000031";
const anchoredThread = "80000000-0000-4000-8000-000000000032";

const text = (value: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: value }] }],
});

const comment = (
  id: string,
  createdById: string,
  day: number,
  body: string,
  parentCommentId: string | null = null
) => ({
  id,
  documentId,
  parentCommentId,
  createdById,
  createdBy: { id: createdById, name: createdById === me ? "Maceo" : "Thomas" },
  createdAt: `2025-11-${10 + day}T09:00:00.000Z`,
  updatedAt: `2025-11-${10 + day}T09:00:00.000Z`,
  data: text(body),
  reactions: [],
});

const discussions = [
  comment(pageThread, thomas, 1, "Premier"),
  comment("80000000-0000-4000-8000-000000000041", me, 2, "Deux", pageThread),
  comment(
    "80000000-0000-4000-8000-000000000042",
    thomas,
    3,
    "Trois",
    pageThread
  ),
  comment("80000000-0000-4000-8000-000000000043", me, 4, "Quatre", pageThread),
  comment(anchoredThread, thomas, 5, "Sur le passage"),
];

describe("RowCommentsPopover", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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
    stores.users.add({ id: me, name: "Maceo" });
    stores.users.add({ id: thomas, name: "Thomas" });
    stores.auth.add({ id: teamId, name: "Galadrim", preferences: {} });
    runInAction(() => {
      stores.auth.currentUserId = me;
      stores.auth.currentTeamId = teamId;
    });
    rowCommentCounts.invalidate(databaseId);
    vi.mocked(client.post).mockReset();
    vi.mocked(client.post).mockImplementation(async (path: string) => {
      switch (path) {
        case "/databaseRecords.commentCounts":
          return { data: { rec1: 5 } };
        case "/databaseRecords.open":
          return {
            data: {
              id: documentId,
              title: "Ticket",
              databaseId,
              databaseRecordId: "rec1",
              data: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Le passage",
                        marks: [
                          { type: "comment", attrs: { id: anchoredThread } },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
            policies: [
              {
                id: documentId,
                abilities: { read: true, comment: true, update: true },
              },
            ],
          };
        case "/comments.list":
          return {
            data: discussions,
            pagination: { offset: 0, limit: 100, total: discussions.length },
          };
        default:
          return { data: {} };
      }
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("opens the row's discussions on the spot, whole, the last one ready for a reply", async () => {
    const opened: string[] = [];
    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <ActionContextProvider>
                <DatabaseBlockContext.Provider
                  value={{
                    onViewCreated: () => undefined,
                    filterRequest: undefined,
                  }}
                >
                  <div onClick={() => opened.push("rec1")}>
                    <CommentCount
                      databaseId={databaseId}
                      recordId="rec1"
                      documentId={documentId}
                    />
                  </div>
                </DatabaseBlockContext.Provider>
              </ActionContextProvider>
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    const count = container.querySelector<HTMLElement>(
      "button[aria-label^='5 comment']"
    );
    await act(async () => {
      count?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const popover = document.querySelector<HTMLElement>(
      "[role='dialog'][aria-label='Comments']"
    );
    expect(opened).toEqual([]);
    expect(popover).not.toBeNull();
    const threads = popover?.querySelectorAll("[data-comment-thread]") ?? [];
    expect(threads).toHaveLength(2);
    expect(threads[0].textContent).not.toContain("Show");
    expect(threads[0].textContent?.match(/Thomas/g)).toHaveLength(2);
    expect(threads[0].textContent?.match(/Maceo/g)).toHaveLength(2);
    expect(threads[1].textContent).toContain("Le passage");
    expect(threads[0].querySelectorAll("form")).toHaveLength(4);
    expect(threads[1].querySelectorAll("form")).toHaveLength(2);
  });
});
