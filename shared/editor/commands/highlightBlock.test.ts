import {
  createEditorStateWithSelection,
  doc,
  heading,
  p,
  schema,
} from "@shared/test/editor";
import { highlightBlock } from "./highlightBlock";
import { selectTextblock } from "./selectTextblock";

const highlight = schema.marks.highlight;

describe("highlightBlock", () => {
  it("highlights the whole text of the block holding the cursor", () => {
    const state = createEditorStateWithSelection(
      doc([p("before"), p("colour me"), p("after")]),
      12
    );
    let next = state;
    highlightBlock(highlight, "#FFCDD0")(state, (tr) => {
      next = state.apply(tr);
    });

    const [before, block, after] = next.doc.children;
    expect(before.firstChild?.marks).toEqual([]);
    expect(block.firstChild?.text).toBe("colour me");
    expect(block.firstChild?.marks.map((mark) => mark.attrs.color)).toEqual([
      "#FFCDD0",
    ]);
    expect(after.firstChild?.marks).toEqual([]);
  });

  it("makes the text typed next in an empty block highlighted", () => {
    const state = createEditorStateWithSelection(doc([p("")]), 1);
    let next = state;
    highlightBlock(highlight, "#FFCDD0")(state, (tr) => {
      next = state.apply(tr);
    });
    expect(next.storedMarks?.map((mark) => mark.attrs.color)).toEqual([
      "#FFCDD0",
    ]);
  });

  it("replaces a highlight of another colour, and clears it with null", () => {
    const state = createEditorStateWithSelection(doc(heading("Title")), 2);
    let next = state;
    highlightBlock(highlight, "#C3E1EE")(state, (tr) => {
      next = state.apply(tr);
    });
    highlightBlock(highlight, "#D2E1D0")(next, (tr) => {
      next = next.apply(tr);
    });
    expect(
      next.doc.firstChild?.firstChild?.marks.map((mark) => mark.attrs.color)
    ).toEqual(["#D2E1D0"]);

    highlightBlock(highlight, null)(next, (tr) => {
      next = next.apply(tr);
    });
    expect(next.doc.firstChild?.firstChild?.marks).toEqual([]);
    expect(next.storedMarks ?? []).toEqual([]);
  });
});

describe("selectTextblock", () => {
  it("selects the text of the block holding the cursor", () => {
    const state = createEditorStateWithSelection(
      doc([p("one"), p("two words")]),
      7
    );
    let next = state;
    expect(
      selectTextblock()(state, (tr) => {
        next = state.apply(tr);
      })
    ).toBe(true);
    const { from, to } = next.selection;
    expect(next.doc.textBetween(from, to)).toBe("two words");
  });

  it("fails on an empty block", () => {
    const state = createEditorStateWithSelection(doc([p("")]), 1);
    expect(selectTextblock()(state)).toBe(false);
  });
});
