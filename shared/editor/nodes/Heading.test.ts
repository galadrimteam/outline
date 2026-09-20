import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import type { DecorationSet } from "prosemirror-view";
import type { Editor } from "../../../app/editor";
import Heading from "./Heading";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 1 } },
    },
    text: { group: "inline" },
  },
});

/** Fakes just enough of an Editor for the plugin's readOnly check. */
function editorStub(readOnly: boolean | undefined): Editor {
  return { props: { readOnly } } as unknown as Editor;
}

/** Builds a state for a single heading and returns its widget decorations. */
function decorationsFor(readOnly: boolean | undefined) {
  const heading = new Heading();
  heading.editor = editorStub(readOnly);

  const state = EditorState.create({
    doc: schema.nodes.doc.create(
      null,
      schema.nodes.heading.create({ level: 1 }, schema.text("Title"))
    ),
    plugins: heading.plugins,
  });

  const decorations = state.plugins[0].getState(state) as DecorationSet;
  return decorations
    .find()
    .map((decoration) => (decoration.spec as { key?: string }).key);
}

describe("Heading anchor widget", () => {
  it("is mounted while editing", () => {
    expect(decorationsFor(false)).toContain("anchor");
  });

  it("is mounted when readOnly is not set, as in a plain EditorState", () => {
    expect(decorationsFor(undefined)).toContain("anchor");
  });

  it("is not mounted for a read-only viewer", () => {
    // galadrim: Notion shows no "copy link" affordance to a read-only
    // viewer either, see the comment in Heading.ts.
    expect(decorationsFor(true)).not.toContain("anchor");
  });
});
