import type { Slice } from "prosemirror-model";
import { parser } from "../../test/editor";
import { ChangesetHelper, type ExtendedChange } from "./ChangesetHelper";
import type { ProsemirrorData } from "../../types";

/**
 * Builds a single-paragraph document from the given text.
 */
function para(text: string): ProsemirrorData {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

/**
 * Builds a document with one paragraph per provided text.
 */
function paras(...texts: string[]): ProsemirrorData {
  return {
    type: "doc",
    content: texts.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

/**
 * Computes the changeset between two documents, asserts it is non-null, and
 * returns the resulting changes.
 */
function changesFor(
  after: ProsemirrorData,
  before: ProsemirrorData
): readonly ExtendedChange[] {
  const result = ChangesetHelper.getChangeset(after, before);
  expect(result).not.toBeNull();
  return result!.changes;
}

/**
 * Concatenates the text content of every deletion slice in a change.
 */
function deletedText(change: ExtendedChange): string {
  return change.deleted
    .map((deletion) => {
      const { slice } = deletion.data as { slice: Slice | null };
      return slice ? slice.content.textBetween(0, slice.content.size) : "";
    })
    .join("");
}

describe("ChangesetHelper.getChangeset", () => {
  it("returns null when there is no previous revision to compare against", () => {
    expect(ChangesetHelper.getChangeset(para("Hello"), null)).toBeNull();
    expect(ChangesetHelper.getChangeset(null, para("Hello"))).toBeNull();
  });

  describe("interleaved word-diff merging", () => {
    it("merges a hyphenated word replacement into a single change", () => {
      // Word-level diffing splits "no-await-in-loop" -> "jsx-no-jsx-as-prop"
      // into several interleaved delete/insert changes around the hyphens.
      // These should be merged back into one change covering the whole word.
      const changes = changesFor(
        para("jsx-no-jsx-as-prop"),
        para("no-await-in-loop")
      );

      expect(changes).toHaveLength(1);

      const [change] = changes;
      expect(change.fromA).toBe(1);
      expect(change.toA).toBe(17); // length of "no-await-in-loop" + 1 (doc offset)
      expect(change.fromB).toBe(1);
      expect(change.toB).toBe(19); // length of "jsx-no-jsx-as-prop" + 1
      expect(change.deleted).toHaveLength(1);
      expect(change.inserted).toHaveLength(1);
    });

    it("captures the full original word in the merged deletion", () => {
      const changes = changesFor(
        para("jsx-no-jsx-as-prop"),
        para("no-await-in-loop")
      );

      expect(deletedText(changes[0])).toBe("no-await-in-loop");
    });
  });

  describe("does not over-merge unrelated changes", () => {
    it("keeps edits in separate nodes separate", () => {
      // Two single-character replacements in two different paragraphs sit
      // close together positionally, but the gap between them crosses a
      // paragraph boundary and must not be merged.
      const changes = changesFor(paras("c", "d"), paras("a", "b"));

      expect(changes).toHaveLength(2);
      expect(deletedText(changes[0])).toBe("a");
      expect(deletedText(changes[1])).toBe("b");
    });

    it("keeps edits separated by a large unchanged gap separate", () => {
      // "quick" and "fox" are replaced, but the unchanged " brown " between
      // them exceeds the merge gap threshold, so they stay distinct.
      const changes = changesFor(
        para("The slow brown lazy"),
        para("The quick brown fox")
      );

      expect(changes).toHaveLength(2);
      expect(deletedText(changes[0])).toBe("quick");
      expect(deletedText(changes[1])).toBe("fox");
    });

    it("does not merge a cluster of pure insertions", () => {
      // Inserting text on both sides of the unchanged "a" produces two pure
      // insertions a short gap apart. Merging them would render the unchanged
      // "a" as inserted, so the window (no deletion) must not merge.
      const changes = changesFor(para("foo a bar"), para("a"));

      expect(changes).toHaveLength(2);
      // Both are pure insertions — nothing is marked as deleted.
      expect(changes.every((change) => change.deleted.length === 0)).toBe(true);
    });

    it("does not merge a cluster of pure deletions", () => {
      // Deleting text on both sides of the unchanged "a" produces two pure
      // deletions a short gap apart. Merging them would render the unchanged
      // "a" as deleted, so the window (no insertion) must not merge.
      const changes = changesFor(para("a"), para("foo a bar"));

      expect(changes).toHaveLength(2);
      // The unchanged "a" is not absorbed into either deletion.
      expect(deletedText(changes[0])).toBe("foo ");
      expect(deletedText(changes[1])).toBe(" bar");
    });
  });

  describe("gap merge threshold", () => {
    // Two word replacements ("cat"->"fox", "dog"->"pig") separated by an
    // unchanged middle word. The gap between the two changes equals the
    // middle length plus its two surrounding spaces. mergeInterleavedChanges
    // merges them only while that gap is <= MAX_UNCHANGED_GAP (3).
    //
    // The trade-off these cases document: when the gap is small enough to
    // merge, the unchanged middle word is absorbed into the deletion and
    // therefore rendered as deleted + reinserted.

    it("merges across a gap of 3, absorbing the unchanged middle", () => {
      // " a " => gap of 3 (1 char + 2 spaces), the threshold.
      const changes = changesFor(para("fox a pig"), para("cat a dog"));

      expect(changes).toHaveLength(1);
      // The unchanged "a" is swallowed into the merged deletion.
      expect(deletedText(changes[0])).toBe("cat a dog");
    });

    it("does not merge across a gap of 4", () => {
      // " ab " => gap of 4 (2 chars + 2 spaces), just past the threshold.
      const changes = changesFor(para("fox ab pig"), para("cat ab dog"));

      expect(changes).toHaveLength(2);
      // The two edits stay distinct and the middle "ab" is untouched.
      expect(deletedText(changes[0])).toBe("cat");
      expect(deletedText(changes[1])).toBe("dog");
    });
  });

  describe("comment marks", () => {
    /**
     * Builds a paragraph where the given word carries a comment mark.
     */
    function commented(
      before: string,
      word: string,
      after: string
    ): ProsemirrorData {
      return {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: before },
              {
                type: "text",
                text: word,
                marks: [
                  { type: "comment", attrs: { id: "comment-id", userId: "u" } },
                ],
              },
              { type: "text", text: after },
            ],
          },
        ],
      };
    }

    it("ignores a comment mark added to otherwise unchanged text", () => {
      const changes = changesFor(
        commented("Hello ", "brave", " world"),
        para("Hello brave world")
      );

      expect(changes).toHaveLength(0);
    });

    it("ignores a comment mark removed from otherwise unchanged text", () => {
      const changes = changesFor(
        para("Hello brave world"),
        commented("Hello ", "brave", " world")
      );

      expect(changes).toHaveLength(0);
    });

    it("still reports text changes within commented text", () => {
      const changes = changesFor(
        commented("Hello ", "bold", " world"),
        commented("Hello ", "brave", " world")
      );

      expect(changes).toHaveLength(1);
      expect(deletedText(changes[0])).toBe("brave");
    });
  });

  it("does not affect a simple single-word change", () => {
    const changes = changesFor(
      para("Hello modified world"),
      para("Hello world")
    );

    expect(changes).toHaveLength(1);
    expect(changes[0].inserted).toHaveLength(1);
  });

  describe("node boundary tokens", () => {
    it("reports the change to a node's closing token when its type changes", () => {
      // Converting a paragraph to a heading rewrites both of the node's
      // boundary tokens. The closing tokens of the two node types must not
      // compare as equal, or only the opening one is reported.
      const changes = changesFor(
        {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [{ type: "text", text: "Alpha" }],
            },
          ],
        },
        para("Alpha")
      );

      expect(changes).toHaveLength(2);
      // The paragraph opens at 0 and closes at 6, either side of "Alpha".
      expect([changes[0].fromA, changes[0].toA]).toEqual([0, 1]);
      expect([changes[1].fromA, changes[1].toA]).toEqual([6, 7]);
    });

    it("places an inserted wrapper's closing token outside the node it wraps", () => {
      // Wrapping the paragraph in a blockquote inserts the quote's closing
      // token after the paragraph, at the end of the old document. Matching it
      // to the paragraph's own closing token instead would report the
      // insertion at 6, inside the paragraph.
      const changes = changesFor(
        {
          type: "doc",
          content: [
            {
              type: "blockquote",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Alpha" }],
                },
              ],
            },
          ],
        },
        para("Alpha")
      );

      expect(changes).toHaveLength(2);
      expect([changes[0].fromA, changes[0].toA]).toEqual([0, 0]);
      expect([changes[1].fromA, changes[1].toA]).toEqual([7, 7]);
      // In the new document the change is the blockquote's closing token at
      // 8, not the paragraph's at 7.
      expect([changes[1].fromB, changes[1].toB]).toEqual([8, 9]);
    });
  });

  // galadrim: a deleted callout has to reach the rendered diff (the revision
  // viewer and the e-mail diff both render `deleted`). Recreating the steps
  // from JSON patches deletes a node whose attributes are not the schema's
  // defaults in two steps — the attributes are reset first, then the node is
  // removed — and the first step alone looks exactly like an attribute change.
  // A deletion is therefore only read as one when the node the step left
  // behind is still in the new document (ChangesetHelper.containsNode).
  describe("a deleted notice", () => {
    const withNotice = (fence: string) => `Kept paragraph

- list item 1
- list item 2

${fence}
Content in a callout
:::

- [ ] task 1
- [x] task 2

same on both sides`;

    const withoutNotice = `Kept paragraph

An added paragraph

- list item 1
- list item 2

Another added paragraph

- [x] task 1
- [ ] task 2
- [ ] task 3

same on both sides`;

    const fromMarkdown = (markdown: string) =>
      parser.parse(markdown)!.toJSON() as ProsemirrorData;

    // Every style, and a callout carrying its own emoji: `default` is the one
    // Notion's callouts import as, and three notices out of four have an emoji.
    it.each([
      ":::info",
      ":::",
      ":::warning",
      ":::tip",
      ":::success",
      ":::info 💡",
      "::: 💡",
    ])("%s is reported as a deletion, not as an attribute change", (fence) => {
      const changes = changesFor(
        fromMarkdown(withoutNotice),
        fromMarkdown(withNotice(fence))
      );

      expect(changes.map(deletedText).join("")).toContain(
        "Content in a callout"
      );
      expect(changes.flatMap((change) => change.modified)).toHaveLength(0);
    });
  });

  // galadrim: the other side of the guard above — a notice that is still there
  // with another style, or another icon, is still reported as an attribute
  // change and not as a deletion followed by an insertion.
  describe("a notice that changed", () => {
    const fromMarkdown = (markdown: string) =>
      parser.parse(markdown)!.toJSON() as ProsemirrorData;

    const attributeChanges = (after: string, before: string) =>
      changesFor(fromMarkdown(after), fromMarkdown(before)).flatMap((change) =>
        change.modified.map((modification) => modification.data)
      );

    it("reports a style change as an attribute change", () => {
      const modified = attributeChanges(
        "Intro\n\n:::tip\nContent in a callout\n:::\n\nOutro",
        "Intro\n\n:::warning\nContent in a callout\n:::\n\nOutro"
      );

      expect(modified).toHaveLength(1);
      expect(modified[0].oldAttrs.style).toBe("tip");
      expect(modified[0].newAttrs.style).toBe("warning");
    });

    it("reports an icon change as an attribute change", () => {
      const modified = attributeChanges(
        "Intro\n\n:::info 💡\nContent in a callout\n:::\n\nOutro",
        "Intro\n\n:::info\nContent in a callout\n:::\n\nOutro"
      );

      expect(modified).toHaveLength(1);
      expect(modified[0].oldAttrs.icon).toBe("💡");
      expect(modified[0].newAttrs.icon).toBeNull();
    });

    it("reports a code block's language change as an attribute change", () => {
      const modified = attributeChanges(
        "Intro\n\n```python\nconst a = 1;\n```\n\nOutro",
        "Intro\n\n```javascript\nconst a = 1;\n```\n\nOutro"
      );

      expect(modified).toHaveLength(1);
      expect(modified[0].oldAttrs.language).toBe("python");
      expect(modified[0].newAttrs.language).toBe("javascript");
    });
  });

  describe("complexity guard", () => {
    const texts = Array.from(
      { length: 500 },
      (_, i) => `paragraph ${i} ${"lorem ipsum dolor sit amet ".repeat(12)}`
    );

    it("returns null when the changeset is too expensive to compute", () => {
      const before = paras(...texts);
      const after = paras(...texts.map((text) => `${text} rewritten`));

      expect(ChangesetHelper.getChangeset(after, before)).toBeNull();
    });

    it("still computes a changeset for a small change to a large document", () => {
      const before = paras(...texts);
      const after = paras(...texts.slice(0, -1), "a different final paragraph");

      expect(ChangesetHelper.getChangeset(after, before)).not.toBeNull();
    });
  });
});
