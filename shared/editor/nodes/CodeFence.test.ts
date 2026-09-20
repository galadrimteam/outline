/**
 * @vitest-environment jsdom
 */
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import type { Plugin } from "prosemirror-state";
import type { DecorationSet } from "prosemirror-view";
import CodeFence from "./CodeFence";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    code_fence: {
      content: "text*",
      group: "block",
      code: true,
      attrs: { language: { default: null }, wrap: { default: false } },
    },
    text: { group: "inline" },
  },
});

type CollapseState = {
  tallBlocks: Set<number>;
  collapsedBlocks: Set<number>;
  decorations: DecorationSet;
};

/** Reaches the private collapse plugins without depending on the full,
 * heavier `plugins` getter (which needs a bound editor for unrelated
 * concerns like syntax highlighting theme). */
function collapsePluginsOf(codeFence: CodeFence): Plugin[] {
  return (
    codeFence as unknown as { collapsePlugins(): Plugin[] }
  ).collapsePlugins();
}

/** A code block with the given number of lines, long enough (at jsdom's
 * default viewport height) to be found "tall" by findTallBlocks. */
function docWithLines(lines: number) {
  const text = Array.from({ length: lines }, (_, i) => `line ${i}`).join("\n");
  return schema.nodes.doc.create(
    null,
    schema.nodes.code_fence.create(null, schema.text(text))
  );
}

function collapseStateFor(doc: ReturnType<typeof docWithLines>) {
  const state = EditorState.create({
    doc,
    plugins: collapsePluginsOf(new CodeFence()),
  });
  return state.plugins[0].getState(state) as CollapseState;
}

describe("CodeFence collapse", () => {
  it("still finds a tall block, so it can still be folded by hand", () => {
    const collapseState = collapseStateFor(docWithLines(200));
    expect(collapseState.tallBlocks.size).toBe(1);
  });

  it("does not auto-collapse a tall block on load", () => {
    // galadrim: Notion always renders a code block in full; a tall block
    // used to start collapsed with no visible way back to seeing it all.
    const collapseState = collapseStateFor(docWithLines(200));
    expect(collapseState.collapsedBlocks.size).toBe(0);
  });

  it("leaves a short block alone either way", () => {
    const collapseState = collapseStateFor(docWithLines(3));
    expect(collapseState.tallBlocks.size).toBe(0);
    expect(collapseState.collapsedBlocks.size).toBe(0);
  });
});
