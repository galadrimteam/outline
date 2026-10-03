import { escapeClosesPeek, isRowPeek, peekedDocumentSlug } from "./rowPeek";

describe("isRowPeek", () => {
  it("is a row page in the side pane", () => {
    expect(isRowPeek("secondary", { databaseId: "db1" })).toBe(true);
    expect(isRowPeek("primary", { databaseId: "db1" })).toBe(false);
    expect(isRowPeek("secondary", { databaseId: null })).toBe(false);
  });
});

describe("peekedDocumentSlug", () => {
  it("reads the page shown beside from the main pane's query", () => {
    expect(
      peekedDocumentSlug(
        `?split=${encodeURIComponent("/doc/etqju-Av5Nm6egXn?focus=1")}`
      )
    ).toBe("etqju-Av5Nm6egXn");
  });

  it("is undefined without a page beside", () => {
    expect(peekedDocumentSlug("")).toBeUndefined();
    expect(
      peekedDocumentSlug(`?split=${encodeURIComponent("/collection/abc")}`)
    ).toBeUndefined();
  });
});

describe("escapeClosesPeek", () => {
  function inside(role: string | null, html: string) {
    const host = document.createElement("div");
    if (role) {
      host.setAttribute("role", role);
    }
    host.innerHTML = html;
    document.body.appendChild(host);
    return host.firstElementChild;
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("closes from the page, and from a button such as the row's « Open »", () => {
    expect(escapeClosesPeek(document.body)).toBe(true);
    expect(escapeClosesPeek(inside("grid", "<button>Open</button>"))).toBe(
      true
    );
  });

  it("leaves Escape to text fields, menus, dialogs and tables", () => {
    expect(escapeClosesPeek(inside(null, "<input />"))).toBe(false);
    expect(
      escapeClosesPeek(inside(null, '<div contenteditable="true"></div>'))
    ).toBe(false);
    expect(escapeClosesPeek(inside("menu", "<button>Rename</button>"))).toBe(
      false
    );
    expect(escapeClosesPeek(inside("dialog", "<span>Edit</span>"))).toBe(false);
    expect(escapeClosesPeek(inside("grid", "<span>Cell</span>"))).toBe(false);
  });
});
