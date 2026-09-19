import { documentBreadcrumbNodes } from "./DocumentBreadcrumb";

const node = (id: string, title = id) => ({ id, title, url: `/doc/${id}` });

const doc = (pathTo: ReturnType<typeof node>[]) => ({
  id: "current",
  title: "Live title",
  url: "/doc/current",
  icon: "🧪",
  color: null,
  pathTo,
});

describe("documentBreadcrumbNodes", () => {
  it("lists the ancestors only by default, as upstream", () => {
    const nodes = documentBreadcrumbNodes(
      doc([node("root"), node("parent"), node("current", "Stale title")])
    );

    expect(nodes.map((n) => n.id)).toEqual(["root", "parent"]);
  });

  it("ends with the document itself when asked to", () => {
    const nodes = documentBreadcrumbNodes(
      doc([node("root"), node("parent"), node("current", "Stale title")]),
      true
    );

    expect(nodes.map((n) => n.id)).toEqual(["root", "parent", "current"]);
  });

  it("renders the current document from its live title and icon", () => {
    const nodes = documentBreadcrumbNodes(
      doc([node("current", "Stale title")]),
      true
    );

    expect(nodes).toEqual([
      {
        id: "current",
        title: "Live title",
        url: "/doc/current",
        icon: "🧪",
        color: undefined,
      },
    ]);
  });

  it("still shows the document when its path is unknown", () => {
    expect(documentBreadcrumbNodes(doc([]))).toEqual([]);
    expect(documentBreadcrumbNodes(doc([]), true).map((n) => n.id)).toEqual([
      "current",
    ]);
  });

  it("keeps every node of a path that does not end with the document", () => {
    const nodes = documentBreadcrumbNodes(doc([node("root")]), true);

    expect(nodes.map((n) => n.id)).toEqual(["root", "current"]);
  });
});
