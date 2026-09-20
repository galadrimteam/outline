import { findNodes, parser, serializer } from "../../test/editor";

it("preserves mixed checkbox and regular items in a list", () => {
  const markdown = `- [x] Checked item
- Regular item
- [ ] Unchecked item`;

  const ast = parser.parse(markdown);
  const [checkboxList] = findNodes(ast?.toJSON(), "checkbox_list");

  expect(checkboxList).toBeDefined();
  expect(checkboxList?.content).toHaveLength(3);
  expect(checkboxList?.content?.[0].type).toBe("checkbox_item");
  expect(checkboxList?.content?.[1].type).toBe("checkbox_item");
  expect(checkboxList?.content?.[2].type).toBe("checkbox_item");
});

it("round-trips mixed checkbox lists through serializer", () => {
  const markdown = `- [x] Checked
- Plain text
- [ ] Unchecked`;

  const ast = parser.parse(markdown);
  const output = serializer.serialize(ast);

  // All items should survive the round-trip
  expect(output).toContain("Checked");
  expect(output).toContain("Plain text");
  expect(output).toContain("Unchecked");
});

it("does not convert nested bullet list items inside checkbox lists", () => {
  const markdown = `- [x] Parent checkbox
    - Nested bullet item
    - Another nested item
- [ ] Second checkbox`;

  const ast = parser.parse(markdown);
  const [checkboxList] = findNodes(ast?.toJSON(), "checkbox_list");

  expect(checkboxList).toBeDefined();
  expect(checkboxList?.content).toHaveLength(2);
  expect(checkboxList?.content?.[0].type).toBe("checkbox_item");
  expect(checkboxList?.content?.[1].type).toBe("checkbox_item");

  // Nested list should remain a bullet_list, not a checkbox_list
  const [nestedList] = findNodes(checkboxList?.content?.[0], "bullet_list");
  expect(nestedList).toBeDefined();
  expect(nestedList?.content?.[0].type).toBe("list_item");
});

it("converts a list where a plain item precedes a checkbox item", () => {
  const markdown = `- Item one
- [ ] Item two`;

  const ast = parser.parse(markdown);
  const [checkboxList] = findNodes(ast?.toJSON(), "checkbox_list");

  expect(checkboxList).toBeDefined();
  expect(checkboxList?.content).toHaveLength(2);
  expect(checkboxList?.content?.[0].type).toBe("checkbox_item");
  expect(checkboxList?.content?.[1].type).toBe("checkbox_item");
  expect(serializer.serialize(ast)).toBe(`- [ ] Item one
- [ ] Item two`);
});

it("converts a nested list where a plain item precedes a checkbox item", () => {
  const markdown = `- Parent
    - Nested plain
    - [x] Nested checkbox
- Sibling`;

  const ast = parser.parse(markdown);
  const [bulletList] = findNodes(ast?.toJSON(), "bullet_list");
  const [checkboxList] = findNodes(ast?.toJSON(), "checkbox_list");

  expect(bulletList?.content).toHaveLength(2);
  expect(checkboxList).toBeDefined();
  expect(checkboxList?.content).toHaveLength(2);
  expect(checkboxList?.content?.[0].type).toBe("checkbox_item");
  expect(checkboxList?.content?.[1].type).toBe("checkbox_item");
  expect(checkboxList?.content?.[1].attrs?.checked).toBe(true);
});

it("converts an ordered list containing a checkbox item", () => {
  const markdown = `1. Item one
2. [ ] Item two`;

  const ast = parser.parse(markdown);
  const [checkboxList] = findNodes(ast?.toJSON(), "checkbox_list");

  expect(checkboxList).toBeDefined();
  expect(checkboxList?.content).toHaveLength(2);
  expect(checkboxList?.content?.[0].type).toBe("checkbox_item");
  expect(checkboxList?.content?.[1].type).toBe("checkbox_item");
});

// galadrim: regression tests, a to-do list with several items used to retype
// the neighbouring plain lists of the same level into to-do lists.
describe("lists next to a checkbox list", () => {
  const plain = `- plain A
- plain B`;
  const ordered = `1. first
2. second`;
  const todos = `- [ ] task 1
- [ ] task 2
- [x] task 3`;
  const sep = `

paragraph

`;

  const topLevelTypes = (markdown: string) =>
    (parser.parse(markdown)?.toJSON().content ?? []).map(
      (node: { type: string }) => node.type
    );

  it("keeps a bullet list that precedes a checkbox list with one item", () => {
    expect(topLevelTypes(`${plain}${sep}- [ ] task 1`)).toEqual([
      "bullet_list",
      "paragraph",
      "checkbox_list",
    ]);
  });

  it("keeps a bullet list that precedes a checkbox list with several items", () => {
    const markdown = `${plain}${sep}${todos}`;
    const ast = parser.parse(markdown);

    expect(topLevelTypes(markdown)).toEqual([
      "bullet_list",
      "paragraph",
      "checkbox_list",
    ]);

    const [bulletList] = findNodes(ast?.toJSON(), "bullet_list");
    expect(bulletList?.content).toHaveLength(2);
    expect(bulletList?.content?.[0].type).toBe("list_item");

    const [checkboxList] = findNodes(ast?.toJSON(), "checkbox_list");
    expect(checkboxList?.content).toHaveLength(3);
    expect(checkboxList?.content?.[2].attrs?.checked).toBe(true);

    // and the Markdown written back parses to the same blocks
    expect(topLevelTypes(serializer.serialize(ast))).toEqual(
      topLevelTypes(markdown)
    );
  });

  it("keeps ordered and bullet lists that precede a checkbox list", () => {
    const markdown = `${ordered}${sep}${plain}${sep}${todos}`;
    const ast = parser.parse(markdown);

    expect(topLevelTypes(markdown)).toEqual([
      "ordered_list",
      "paragraph",
      "bullet_list",
      "paragraph",
      "checkbox_list",
    ]);
    // and the Markdown written back parses to the same blocks
    expect(topLevelTypes(serializer.serialize(ast))).toEqual(
      topLevelTypes(markdown)
    );
  });

  it("keeps a bullet list that follows a checkbox list", () => {
    const markdown = `${todos}${sep}${plain}`;
    const ast = parser.parse(markdown);

    expect(topLevelTypes(markdown)).toEqual([
      "checkbox_list",
      "paragraph",
      "bullet_list",
    ]);
    expect(findNodes(ast?.toJSON(), "checkbox_item")).toHaveLength(3);
    expect(findNodes(ast?.toJSON(), "list_item")).toHaveLength(2);
    // and the Markdown written back parses to the same blocks
    expect(topLevelTypes(serializer.serialize(ast))).toEqual(
      topLevelTypes(markdown)
    );
  });

  it("keeps bullet lists around a checkbox list under a heading", () => {
    const markdown = `${plain}

## Heading

${todos}

## Heading

${plain}`;

    expect(topLevelTypes(markdown)).toEqual([
      "bullet_list",
      "heading",
      "checkbox_list",
      "heading",
      "bullet_list",
    ]);
  });

  it("keeps sibling nested bullet lists next to a nested checkbox list", () => {
    const markdown = `- Parent one
    - nested plain A
    - nested plain B
- Parent two
    - [ ] nested task 1
    - [ ] nested task 2
- Parent three
    - nested plain C`;

    const ast = parser.parse(markdown);
    const [outer] = findNodes(ast?.toJSON(), "bullet_list");

    expect(outer?.content).toHaveLength(3);
    expect(findNodes(outer?.content?.[0], "bullet_list")).toHaveLength(1);
    expect(findNodes(outer?.content?.[0], "checkbox_list")).toHaveLength(0);
    expect(findNodes(outer?.content?.[1], "checkbox_list")).toHaveLength(1);
    expect(findNodes(outer?.content?.[1], "checkbox_item")).toHaveLength(2);
    expect(findNodes(outer?.content?.[2], "bullet_list")).toHaveLength(1);
    expect(findNodes(outer?.content?.[2], "checkbox_list")).toHaveLength(0);
  });
});

// galadrim: a to-do without a label ("- [ ]") is a checkbox, not a bullet showing "[ ]".
describe("checkbox items without a label", () => {
  it("parses empty to-dos as checkbox items", () => {
    const markdown = `- [ ]
- [x]
- [ ] labelled`;
    const ast = parser.parse(markdown);
    const [checkboxList] = findNodes(ast?.toJSON(), "checkbox_list");

    expect(checkboxList?.content).toHaveLength(3);
    expect(checkboxList?.content?.[0].attrs?.checked).toBe(false);
    expect(checkboxList?.content?.[1].attrs?.checked).toBe(true);
    expect(findNodes(checkboxList?.content?.[0], "text")).toHaveLength(0);
    expect(findNodes(checkboxList?.content?.[2], "text")[0].text).toBe(
      "labelled"
    );
  });

  it("survives a round trip through the serializer", () => {
    const ast = parser.parse(`- [ ]
- [ ] labelled`);
    const again = parser.parse(serializer.serialize(ast));

    expect(findNodes(again?.toJSON(), "checkbox_item")).toHaveLength(2);
    expect(findNodes(again?.toJSON(), "list_item")).toHaveLength(0);
  });

  it("leaves a bullet that only ends with brackets alone", () => {
    const ast = parser.parse(`- see note [x]`);

    expect(findNodes(ast?.toJSON(), "checkbox_item")).toHaveLength(0);
    expect(findNodes(ast?.toJSON(), "list_item")).toHaveLength(1);
  });
});
