import type Document from "~/models/Document";
import type DocumentsStore from "~/stores/DocumentsStore";
import { ancestorIdsOf } from "./References";

type Node = Pick<Document, "id" | "parentDocumentId">;

const node = (id: string, parentDocumentId?: string): Node => ({
  id,
  parentDocumentId,
});

const store = (nodes: Node[]) =>
  ({
    get: (id: string) => nodes.find((n) => n.id === id),
  }) as unknown as Pick<DocumentsStore, "get">;

describe("ancestorIdsOf", () => {
  it("returns the document itself when it has no parent", () => {
    const document = node("a");

    expect([...ancestorIdsOf(document, store([document]))]).toEqual(["a"]);
  });

  it("walks up the whole chain of parents", () => {
    const nodes = [
      node("root"),
      node("parent", "root"),
      node("child", "parent"),
    ];

    expect([...ancestorIdsOf(nodes[2], store(nodes))]).toEqual([
      "child",
      "parent",
      "root",
    ]);
  });

  it("stops at a parent that is not in the store", () => {
    const child = node("child", "unloaded");

    expect([...ancestorIdsOf(child, store([child]))]).toEqual([
      "child",
      "unloaded",
    ]);
  });

  it("does not loop on a cycle", () => {
    const nodes = [node("a", "b"), node("b", "a")];

    expect([...ancestorIdsOf(nodes[0], store(nodes))]).toEqual(["a", "b"]);
  });
});
