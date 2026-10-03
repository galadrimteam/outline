import { Schema } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import type Extension from "@shared/editor/lib/Extension";
import type { Editor } from "~/editor";
import ComponentView from "./ComponentView";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    database: { group: "block", atom: true },
    text: {},
  },
});

function build(hasBeenFocused: boolean) {
  const editor = { hasBeenFocused, nodeRenderers: new Set() };
  const view = new ComponentView(() => null, {
    editor: editor as unknown as Editor,
    extension: {} as Extension,
    node: schema.node("database"),
    view: { editable: true } as EditorView,
    getPos: () => 0,
    decorations: [],
  });
  return { editor, view };
}

describe("ComponentView", () => {
  it("draws its node unselected while the editor has not had the focus", () => {
    const { view } = build(false);
    view.selectNode();

    expect(view.isSelected).toBe(true);
    expect(view.renderer.props.isSelected).toBe(false);
  });

  it("draws the selection once the editor has had the focus", () => {
    const { editor, view } = build(false);
    editor.hasBeenFocused = true;
    view.selectNode();

    expect(view.renderer.props.isSelected).toBe(true);

    view.deselectNode();
    expect(view.renderer.props.isSelected).toBe(false);
  });
});
