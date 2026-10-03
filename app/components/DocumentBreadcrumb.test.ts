import { documentBreadcrumbNodes, rowDatabaseNode } from "./DocumentBreadcrumb";

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

describe("rowDatabaseNode", () => {
  const database = {
    id: "db",
    title: "Projets",
    icon: null,
    url: "/db/db",
    documentId: null,
  };

  it("names the database of a row page that has no home page, before the page", () => {
    const item = rowDatabaseNode(
      { databaseId: "db", parentDocumentId: undefined },
      database,
      "Untitled database"
    );

    expect(item).toEqual({
      id: "db",
      title: "Projets",
      url: "/db/db",
      icon: undefined,
    });
    expect(
      documentBreadcrumbNodes(doc([node("current")]), true, item).map(
        (n) => n.id
      )
    ).toEqual(["db", "current"]);
  });

  it("leaves it out when the row page sits under the home page of its database", () => {
    expect(
      rowDatabaseNode(
        { databaseId: "db", parentDocumentId: "home" },
        { ...database, documentId: "home" },
        "Untitled database"
      )
    ).toBeUndefined();
  });

  it("names it when the row page sits elsewhere, and gives an untitled one a title", () => {
    expect(
      rowDatabaseNode(
        { databaseId: "db", parentDocumentId: "other" },
        { ...database, title: "", documentId: "home" },
        "Untitled database"
      )?.title
    ).toBe("Untitled database");
  });

  it("adds nothing to a page that is not a row of that database", () => {
    expect(
      rowDatabaseNode(
        { databaseId: undefined, parentDocumentId: undefined },
        database,
        "Untitled database"
      )
    ).toBeUndefined();
    expect(
      rowDatabaseNode(
        { databaseId: "db", parentDocumentId: undefined },
        undefined,
        "Untitled database"
      )
    ).toBeUndefined();
  });
});
