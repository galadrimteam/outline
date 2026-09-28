import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import { light } from "@shared/styles/theme";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { CommentCount } from "./CommentCount";

const databaseId = "30000000-0000-4000-8000-000000000021";

describe("CommentCount", () => {
  let container: HTMLDivElement;
  let root: Root;
  let calls: { path: string; body: Record<string, unknown> }[];

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    calls = [];
    vi.mocked(client.post).mockReset();
    vi.mocked(client.post).mockImplementation(async (path, body) => {
      calls.push({ path, body: (body ?? {}) as Record<string, unknown> });
      return { data: { rec1: 3, rec2: 0 } };
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render(children: React.ReactNode) {
    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <ThemeProvider theme={light}>{children}</ThemeProvider>
        </Provider>
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
  }

  it("loads the counts of the cards on screen in one request", async () => {
    await render(
      <>
        <CommentCount databaseId={databaseId} recordId="rec1" />
        <CommentCount databaseId={databaseId} recordId="rec2" />
        <CommentCount
          databaseId={databaseId}
          recordId="rec3"
          documentId={null}
        />
      </>
    );

    expect(calls).toEqual([
      {
        path: "/databaseRecords.commentCounts",
        body: { databaseId, recordIds: ["rec1", "rec2"] },
      },
    ]);
    const notes = container.querySelectorAll("[role='note']");
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toEqual("3");
    expect(notes[0].getAttribute("aria-label")).toContain("3 comment");
  });
});
