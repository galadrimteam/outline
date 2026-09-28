import type { ProsemirrorData } from "@shared/types";
import type { DatabaseNodeCopy } from "./databaseNodes";
import { databaseIdsIn, rewriteDatabaseNodes } from "./databaseNodes";

function databaseNode(
  databaseId: string,
  viewIds: string[] | null = null
): ProsemirrorData {
  return {
    type: "database",
    attrs: {
      id: `block-${databaseId}`,
      databaseId,
      viewIds,
      fullPage: false,
      legacyHref: null,
      title: "Suivi",
    },
  };
}

const doc: ProsemirrorData = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Projet" }] },
    databaseNode("db-kanban"),
    {
      type: "toggle_block",
      content: [databaseNode("db-epics", ["viwTimeline", "viwOther"])],
    },
    databaseNode("db-kanban", ["viwBoard"]),
  ],
};

describe("databaseIdsIn", () => {
  it("lists every database shown, at any depth, once", () => {
    expect(databaseIdsIn(doc)).toEqual(["db-kanban", "db-epics"]);
  });
});

describe("rewriteDatabaseNodes", () => {
  it("points the nodes at the copies and their views", () => {
    const { doc: result, rewritten } = rewriteDatabaseNodes(
      doc,
      new Map<string, DatabaseNodeCopy>([
        [
          "db-kanban",
          {
            databaseId: "db-kanban-copy",
            viewIds: { viwBoard: "viwBoardCopy" },
            title: "Suivi (copie)",
          },
        ],
        [
          "db-epics",
          { databaseId: "db-epics-copy", viewIds: { viwTimeline: "viwT2" } },
        ],
      ])
    );

    expect(rewritten).toEqual(3);
    expect(result.content?.[1].attrs).toMatchObject({
      id: "block-db-kanban",
      databaseId: "db-kanban-copy",
      viewIds: null,
      title: "Suivi (copie)",
    });
    expect(result.content?.[2].content?.[0].attrs).toMatchObject({
      databaseId: "db-epics-copy",
      viewIds: ["viwT2"],
      title: "Suivi",
    });
    expect(result.content?.[3].attrs).toMatchObject({
      databaseId: "db-kanban-copy",
      viewIds: ["viwBoardCopy"],
    });
    expect(result.content?.[0]).toBe(doc.content?.[0]);
  });

  it("returns the document itself when no node shows a copied database", () => {
    const { doc: result, rewritten } = rewriteDatabaseNodes(
      doc,
      new Map([["db-other", { databaseId: "x", viewIds: {} }]])
    );

    expect(rewritten).toEqual(0);
    expect(result).toBe(doc);
  });
});
