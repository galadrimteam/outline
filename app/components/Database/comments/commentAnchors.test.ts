import { commentAnchors } from "./commentAnchors";

describe("commentAnchors", () => {
  it("reads the passage of each anchored thread, and leaves the page discussions out", () => {
    const anchors = commentAnchors({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Le " },
            {
              type: "text",
              text: "passage",
              marks: [{ type: "comment", attrs: { id: "t1", userId: "u" } }],
            },
            {
              type: "text",
              text: " commenté",
              marks: [
                { type: "bold" },
                { type: "comment", attrs: { id: "t1", userId: "u" } },
              ],
            },
          ],
        },
        {
          type: "image",
          attrs: {
            src: "/x.png",
            marks: [{ type: "comment", attrs: { id: "t2" } }],
          },
        },
      ],
    });

    expect(anchors.get("t1")).toBe("passage commenté");
    expect(anchors.get("t2")).toBe("");
    expect(anchors.has("page")).toBe(false);
  });

  it("knows no anchor without content", () => {
    expect(commentAnchors(undefined).size).toBe(0);
  });
});
