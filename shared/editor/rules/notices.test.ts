import type { JSONNode } from "../../test/editor";
import { findNodes, parser, serializer } from "../../test/editor";
import { parseNoticeInfo } from "./notices";

/** The document's first notice, which every test here expects to exist. */
const notice = (
  markdown: string
): JSONNode & { attrs: Record<string, unknown> } => {
  const [node] = findNodes(
    parser.parse(markdown)?.toJSON(),
    "container_notice"
  );
  expect(node).toBeDefined();
  return { ...node, attrs: node.attrs ?? {} };
};

describe("parseNoticeInfo", () => {
  it("reads a style on its own", () => {
    expect(parseNoticeInfo("info")).toEqual({ style: "info", icon: undefined });
  });

  it("reads the emoji written after the style", () => {
    expect(parseNoticeInfo("info 💡")).toEqual({ style: "info", icon: "💡" });
  });

  it("tolerates the spaces the fence may carry", () => {
    expect(parseNoticeInfo("  warning   ⚠️  ")).toEqual({
      style: "warning",
      icon: "⚠️",
    });
  });

  it("is empty for a fence with nothing on it", () => {
    expect(parseNoticeInfo(undefined)).toEqual({ style: "", icon: undefined });
  });

  it("ignores a word that is not an emoji", () => {
    expect(parseNoticeInfo("info hello")).toEqual({
      style: "info",
      icon: undefined,
    });
  });

  // galadrim: a fence whose only word is an emoji names no style. Reading that
  // emoji as a style name lost it, from the node and from the Markdown written
  // back.
  it("reads a fence that is only an emoji as an icon with no style", () => {
    expect(parseNoticeInfo("💡")).toEqual({ style: "", icon: "💡" });
  });
});

// galadrim: Notion's export writes a callout's icon as the first character of
// its text; it belongs to the notice, not to its content.
describe("the emoji leading a notice", () => {
  it("becomes the icon and leaves the text alone", () => {
    const node = notice(`:::info
💡 Something to know
:::`);

    expect(node.attrs).toEqual({ style: "info", icon: "💡" });
    expect(findNodes(node, "text")[0].text).toBe("Something to know");
    expect(findNodes(node, "paragraph")).toHaveLength(1);
  });

  it("is taken when it sits alone on the first line", () => {
    const node = notice(`:::info
📌
**Bold first words** and the rest
:::`);

    expect(node.attrs.icon).toBe("📌");
    expect(findNodes(node, "paragraph")).toHaveLength(1);
    expect(findNodes(node, "text").map((n) => n.text)).toEqual([
      "Bold first words",
      " and the rest",
    ]);
  });

  it("is taken when the rest of the callout is a list", () => {
    const node = notice(`:::info
🚀

- one
- two
:::`);

    expect(node.attrs.icon).toBe("🚀");
    expect(findNodes(node, "paragraph")).toHaveLength(2);
    expect(findNodes(node, "list_item")).toHaveLength(2);
    expect(findNodes(node, "text").map((n) => n.text)).toEqual(["one", "two"]);
  });

  // galadrim: a callout whose whole body is its icon — what Notion's export
  // writes for a callout with no text. What is left must be an empty
  // paragraph: a notice cannot be empty, and the content expression used to
  // fill it with a to-do list, so the callout showed a stray checkbox and the
  // next save wrote that checkbox into the Markdown for good.
  it("is the only thing a callout may hold", () => {
    const node = notice(`:::info
✅
:::`);

    expect(node.attrs.icon).toBe("✅");
    expect(findNodes(node, "text")).toHaveLength(0);
    expect(findNodes(node, "paragraph")).toHaveLength(1);
    expect(findNodes(node, "checkbox_list")).toHaveLength(0);
    expect(findNodes(node, "checkbox_item")).toHaveLength(0);
  });

  // galadrim: a fifth of the callouts our importer writes start with a
  // heading, and it is inside that heading that it puts the icon, "### 💡
  // Contexte" — a callout's text has no paragraph to carry it. Notion shows
  // that emoji as the callout's icon and the heading without it.
  it("is taken from a first heading as well", () => {
    const node = notice(`:::tip
### 💡 Contexte

Le texte
:::`);

    expect(node.attrs).toEqual({ style: "tip", icon: "💡" });
    expect(findNodes(node, "heading")).toHaveLength(1);
    expect(findNodes(node, "text").map((n) => n.text)).toEqual([
      "Contexte",
      "Le texte",
    ]);
  });

  it("leaves a heading that starts with plain text alone", () => {
    const node = notice(`:::tip
### Contexte
:::`);

    expect(node.attrs).toEqual({ style: "tip", icon: null });
    expect(findNodes(node, "text").map((n) => n.text)).toEqual(["Contexte"]);
  });

  it("is not taken from a heading when the fence carries one", () => {
    const node = notice(`:::tip 🚀
### 💡 Contexte
:::`);

    expect(node.attrs.icon).toBe("🚀");
    expect(findNodes(node, "text").map((n) => n.text)).toEqual(["💡 Contexte"]);
  });

  it("is read from the fence when it is written there", () => {
    const node = notice(`:::warning ⚠️
Careful
:::`);

    expect(node.attrs).toEqual({ style: "warning", icon: "⚠️" });
    expect(findNodes(node, "text")[0].text).toBe("Careful");
  });

  it("leaves a notice that starts with plain text alone", () => {
    const node = notice(`:::success
All good
:::`);

    expect(node.attrs).toEqual({ style: "success", icon: null });
    expect(findNodes(node, "text")[0].text).toBe("All good");
  });

  it("is not taken from anywhere but the first paragraph", () => {
    const node = notice(`:::info
First line
🚀 second line
:::`);

    expect(node.attrs.icon).toBe(null);
    expect(findNodes(node, "text").map((n) => n.text)).toEqual([
      "First line 🚀 second line",
    ]);
  });

  it("survives a round trip through the serializer", () => {
    const markdown = `:::info
💡 Something to know
:::`;
    const once = parser.parse(markdown);
    const written = serializer.serialize(once);

    expect(written).toContain(":::info 💡");

    const twice = notice(written);
    expect(twice.attrs).toEqual({ style: "info", icon: "💡" });
    expect(findNodes(twice, "text")[0].text).toBe("Something to know");
  });

  // galadrim: ":::💡" is a callout with an emoji and no style named. The emoji
  // has to survive the trip, and it used to be read as the style and dropped.
  it("survives a round trip when the fence is only an emoji", () => {
    const node = notice(`:::💡
Something to know
:::`);

    expect(node.attrs).toEqual({ style: "default", icon: "💡" });

    const written = serializer.serialize(parser.parse(`:::💡\nSomething\n:::`));
    expect(written).toContain("💡");
    expect(notice(written).attrs).toEqual({ style: "default", icon: "💡" });
  });
});

// galadrim: Notion's plain callout is grey, and its block colours name the
// style so the importer can pass them straight through.
describe("notice styles", () => {
  it("keeps the four styles Outline already had", () => {
    for (const style of ["info", "tip", "warning", "success"]) {
      expect(notice(`:::${style}\ntext\n:::`).attrs.style).toBe(style);
    }
  });

  it("is Notion's plain grey callout when the fence says nothing", () => {
    expect(notice(":::\ntext\n:::").attrs.style).toBe("default");
  });

  it("reads Notion's block colours", () => {
    expect(notice(":::gray\ntext\n:::").attrs.style).toBe("default");
    expect(notice(":::gray_background\ntext\n:::").attrs.style).toBe("default");
    expect(notice(":::blue_background\ntext\n:::").attrs.style).toBe("info");
    expect(notice(":::yellow_background\ntext\n:::").attrs.style).toBe("tip");
    expect(notice(":::green_background\ntext\n:::").attrs.style).toBe(
      "success"
    );
    expect(notice(":::red_background\ntext\n:::").attrs.style).toBe("warning");
  });

  it("falls back to the plain callout for a style it does not know", () => {
    expect(notice(":::rainbow\ntext\n:::").attrs.style).toBe("default");
  });

  it("writes the style back on the fence", () => {
    const ast = parser.parse(":::gray_background\ntext\n:::");
    expect(serializer.serialize(ast)).toContain(":::default");
  });
});
