import type { EditorState } from "prosemirror-state";
import { createEditorStateWithSelection, doc, p } from "@shared/test/editor";
import Suggestion from "./Suggestion";

class DocumentSuggestion extends Suggestion {
  get name() {
    return "document-menu";
  }

  /** The pattern the menu opens and filters on, for the test. */
  get pattern(): RegExp {
    return this.openRegex;
  }
}

const options = {
  trigger: ["[["],
  allowSpaces: true,
  requireSearchTerm: false,
  enabledInCode: false,
};

/** Runs the extension's command and returns the state it leads to. */
function open(extension: Suggestion, state: EditorState): EditorState {
  let next = state;
  extension.commands()()(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

describe("Suggestion command", () => {
  it("types the trigger at the cursor and opens the menu", () => {
    const extension = new DocumentSuggestion(options);
    const next = open(
      extension,
      createEditorStateWithSelection(doc(p("See ")), 5)
    );

    expect(next.doc.textContent).toBe("See [[");
    expect(extension.isOpen).toBe(true);
  });

  it("puts a space before the trigger after a word, so that it matches", () => {
    const extension = new DocumentSuggestion(options);
    const next = open(
      extension,
      createEditorStateWithSelection(doc(p("See")), 4)
    );

    expect(next.doc.textContent).toBe("See [[");
    expect(extension.pattern.exec(`${next.doc.textContent}Road`)?.[1]).toBe(
      "Road"
    );
  });

  it("does nothing without a dispatch", () => {
    const extension = new DocumentSuggestion(options);
    const state = createEditorStateWithSelection(doc(p("")), 1);

    expect(extension.commands()()(state)).toBe(true);
    expect(extension.isOpen).toBe(false);
  });
});

describe("Suggestion search term", () => {
  it("takes the apostrophes of a French word", () => {
    const extension = new DocumentSuggestion({ ...options, trigger: "@" });

    expect(extension.pattern.exec("le @aujourd'hui")?.[1]).toBe("aujourd'hui");
    expect(extension.pattern.exec("@aujourd’hui")?.[1]).toBe("aujourd’hui");
  });
});
