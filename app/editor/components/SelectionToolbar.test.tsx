import { act } from "react";
import type * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import { createEditorStateWithSelection, parser } from "@shared/test/editor";
import { SelectionToolbar } from "./SelectionToolbar";

// A page whose first text is a link: a database, then a notice linking to Notion.
const doc = parser.parse(
  "[Roadmap](/db/0c440212-8b40-49fa-8a64-2548d6b60d59)\n\n" +
    ":::default 📊\n[Graphique](https://www.notion.so/30a3c3f19e438044967be04e65640d54)\n:::"
);
const state = createEditorStateWithSelection(doc, 3);
const view = {
  state,
  dom: document.createElement("div"),
  focus: vi.fn(),
  dispatch: vi.fn(),
};

vi.mock("./EditorContext", () => ({
  useEditor: () => ({
    view,
    extensions: { extensions: [] },
    commands: {},
    selectionToolbarMenus: [],
  }),
}));
vi.mock("~/hooks/useMobile", () => ({ default: () => false }));
vi.mock("./FloatingToolbar", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="toolbar">{children}</div>
  ),
}));
vi.mock("./LinkEditor", () => ({
  default: () => <div data-testid="link-editor" />,
}));

describe("SelectionToolbar", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (isEditorFocused: boolean) =>
    act(() => {
      root.render(
        <SelectionToolbar
          rtl={false}
          isTemplate={false}
          isActive
          isEditorFocused={isEditorFocused}
          selection={state.selection}
        />
      );
    });

  it("leaves the link a page opens on alone until the editor has the focus", () => {
    expect(state.selection.from).toBe(3);

    render(false);
    expect(container.querySelector("[data-testid='toolbar']")).toBeNull();
    expect(view.focus).not.toHaveBeenCalled();

    render(true);
    expect(
      container.querySelector("[data-testid='link-editor']")
    ).not.toBeNull();
  });
});
