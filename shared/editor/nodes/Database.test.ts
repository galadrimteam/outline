import { EditorState } from "prosemirror-state";
import type { JSONNode } from "../../test/editor";
import Database from "./Database";
import {
  createEditorState,
  extensionManager,
  findNodes,
  p,
  parser,
  schema,
  serializer,
} from "../../test/editor";

const databaseId = "0c440212-8b40-49fa-8a64-2548d6b60d59";
const viewId = "viwAbc123";

const parseToJSON = (markdown: string): JSONNode | undefined =>
  parser.parse(markdown)?.toJSON();

const databaseDoc = (attrs: Record<string, unknown>) =>
  schema.nodeFromJSON({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Before" }] },
      { type: "database", attrs },
      { type: "paragraph", content: [{ type: "text", text: "After" }] },
    ],
  });

describe("Database node", () => {
  describe("markdown", () => {
    it("parses a link to /db/<id> alone on a line into a database block", () => {
      const doc = parseToJSON(
        `Before\n\n[Roadmap](/db/${databaseId})\n\nAfter`
      );
      const nodes = findNodes(doc, "database");

      expect(nodes).toHaveLength(1);
      expect(nodes[0].attrs?.databaseId).toBe(databaseId);
      expect(nodes[0].attrs?.title).toBe("Roadmap");
      expect(nodes[0].attrs?.fullPage).toBe(false);
      expect(typeof nodes[0].attrs?.id).toBe("string");
      expect(findNodes(doc, "paragraph")).toHaveLength(2);
    });

    it("serializes to a link on its own line", () => {
      const doc = databaseDoc({ id: "block-1", databaseId, title: "Roadmap" });

      expect(serializer.serialize(doc).trim()).toBe(
        `Before\n\n[Roadmap](/db/${databaseId})\n\nAfter`
      );
    });

    it("round-trips through markdown", () => {
      const markdown = `[Kanban dev](/db/${databaseId})`;
      const doc = parser.parse(markdown);

      expect(doc && serializer.serialize(doc).trim()).toBe(markdown);
    });

    it("keeps the block's settings through markdown", () => {
      const legacyHref =
        "https://teable.example.com/framed?u=/base/bse1/tbl1 (old)";
      const doc = databaseDoc({
        id: "block-1",
        databaseId,
        viewIds: [viewId, "viwOther"],
        fullPage: true,
        legacyHref,
        title: "Roadmap",
      });
      const markdown = serializer.serialize(doc).trim();

      expect(markdown).toContain(
        `[Roadmap](/db/${databaseId}?views=${viewId},viwOther&full=1&from=`
      );
      expect(markdown).not.toContain("(old)");

      const restored = findNodes(parseToJSON(markdown), "database")[0];
      expect(restored.attrs?.viewIds).toEqual([viewId, "viwOther"]);
      expect(restored.attrs?.fullPage).toBe(true);
      expect(restored.attrs?.legacyHref).toBe(legacyHref);
      expect(restored.attrs?.title).toBe("Roadmap");
    });

    it("keeps a bare link when no setting is set", () => {
      const restored = findNodes(
        parseToJSON(`[Roadmap](/db/${databaseId})`),
        "database"
      )[0];

      expect(restored.attrs?.viewIds).toBeNull();
      expect(restored.attrs?.fullPage).toBe(false);
      expect(restored.attrs?.legacyHref).toBeNull();
    });

    it("reads a single setting", () => {
      const restored = findNodes(
        parseToJSON(`[Roadmap](/db/${databaseId}?full=1)`),
        "database"
      )[0];

      expect(restored.attrs?.fullPage).toBe(true);
      expect(restored.attrs?.viewIds).toBeNull();
    });

    it("falls back to a generic label without a title", () => {
      const doc = databaseDoc({ id: "block-1", databaseId });

      expect(serializer.serialize(doc)).toContain(
        `[Database](/db/${databaseId})`
      );
    });

    it("writes nothing for a block without a database", () => {
      const doc = databaseDoc({ id: "block-1" });

      expect(serializer.serialize(doc)).not.toContain("/db/");
    });

    it("is not claimed inside lists", () => {
      const doc = parseToJSON(`- [Roadmap](/db/${databaseId})`);

      expect(findNodes(doc, "database")).toHaveLength(0);
    });

    it("is not claimed with other text in the paragraph", () => {
      const doc = parseToJSON(`see [Roadmap](/db/${databaseId}) here`);

      expect(findNodes(doc, "database")).toHaveLength(0);
    });

    it("is not claimed for other paths", () => {
      expect(
        findNodes(
          parseToJSON(`[Roadmap](/db/${databaseId}/row/abc)`),
          "database"
        )
      ).toHaveLength(0);
      expect(
        findNodes(parseToJSON("[Roadmap](/db/not-a-uuid)"), "database")
      ).toHaveLength(0);
    });
  });

  describe("JSON", () => {
    it("round-trips every attribute", () => {
      const attrs = {
        id: "block-1",
        databaseId,
        viewIds: [viewId],
        fullPage: true,
        legacyHref: "https://teable.example.com/framed?u=/base/bse1/tbl1",
        title: "Roadmap",
      };
      const json = databaseDoc(attrs).toJSON();
      const restored = schema.nodeFromJSON(json);

      expect(findNodes(restored.toJSON(), "database")[0].attrs).toEqual(attrs);
    });

    it("rejects view ids that are not strings", () => {
      expect(() =>
        schema
          .nodeFromJSON({
            type: "doc",
            content: [{ type: "database", attrs: { viewIds: [1] } }],
          })
          .check()
      ).toThrow();
    });
  });

  describe("commands and plugins", () => {
    it("inserts a database block with a fresh id", () => {
      let state = createEditorState(schema.node("doc", null, [p("")]));
      const extension = extensionManager.extensions.find(
        (item) => item.name === "database"
      );
      const commands =
        extension instanceof Database
          ? extension.commands({ type: schema.nodes.database })
          : undefined;
      commands?.createDatabase({ databaseId, fullPage: true })(state, (tr) => {
        state = state.apply(tr);
      });

      const nodes = findNodes(state.doc.toJSON(), "database");
      expect(nodes).toHaveLength(1);
      expect(nodes[0].attrs?.databaseId).toBe(databaseId);
      expect(nodes[0].attrs?.fullPage).toBe(true);
      expect(nodes[0].attrs?.id).toBeTruthy();
    });

    it("gives a copied block its own id", () => {
      const plugins = new Database().plugins;
      let state = EditorState.create({
        schema,
        doc: schema.node("doc", null, [
          schema.nodes.database.create({ id: "same", databaseId }),
          p(""),
        ]),
        plugins,
      });
      state = state.applyTransaction(
        state.tr.insert(
          state.doc.content.size,
          schema.nodes.database.create({ id: "same", databaseId })
        )
      ).state;

      const ids = findNodes(state.doc.toJSON(), "database").map(
        (node) => node.attrs?.id
      );
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
      expect(ids[0]).toBe("same");
    });
  });
});
