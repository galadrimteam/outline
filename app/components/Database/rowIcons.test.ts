import { linkIcon, rowIcon } from "./rowIcons";

const database = { settings: { iconFieldId: "fldIcon" } };

describe("rowIcon", () => {
  it("shows the icon of the row's page", () => {
    expect(
      rowIcon(database, {
        fields: { fldIcon: "🐛" },
        documentId: "doc1",
        icon: "🚀",
        iconColor: null,
      })
    ).toEqual({ value: "🚀", color: undefined });
  });

  it("follows the loaded page, fresher than the row", () => {
    expect(
      rowIcon(
        database,
        { fields: {}, documentId: "doc1", icon: "🚀" },
        { icon: "crown", color: "#FF0000" }
      )
    ).toEqual({ value: "crown", color: "#FF0000" });
  });

  it("falls back on the icon property when the row has no page or its page no icon", () => {
    expect(rowIcon(database, { fields: { fldIcon: " 🐛 " } })).toEqual({
      value: "🐛",
    });
    expect(
      rowIcon(database, {
        fields: { fldIcon: "🐛" },
        documentId: "doc1",
        icon: null,
      })
    ).toEqual({ value: "🐛" });
  });

  it("has no icon when neither the page nor the property has one", () => {
    expect(
      rowIcon({ settings: {} }, { fields: {}, documentId: "doc1", icon: null })
    ).toBeUndefined();
  });
});

describe("linkIcon", () => {
  it("shows the icon of the linked row's page", () => {
    expect(linkIcon({ id: "rec1", icon: "👑", iconColor: null })).toEqual({
      value: "👑",
      color: undefined,
    });
    expect(linkIcon({ id: "rec1", title: "Prof" })).toBeUndefined();
  });
});
