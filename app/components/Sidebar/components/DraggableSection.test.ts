import { SidebarSection } from "@shared/types";
import {
  defaultSidebarSectionOrder,
  moveSidebarSection,
  normalizeSidebarSectionOrder,
} from "./DraggableSection";

describe("normalizeSidebarSectionOrder", () => {
  it("defaults to Notion's order: starred, recents, teamspaces, shared, private", () => {
    const expected = [
      SidebarSection.Starred,
      SidebarSection.Recents,
      SidebarSection.Collections,
      SidebarSection.SharedWithMe,
      SidebarSection.Private,
    ];

    expect(normalizeSidebarSectionOrder()).toEqual(expected);
    expect(normalizeSidebarSectionOrder([])).toEqual(expected);
  });

  it("covers every section exactly once", () => {
    expect([...defaultSidebarSectionOrder].sort()).toEqual(
      Object.values(SidebarSection).sort()
    );
  });

  it("keeps an order saved before the private and recents sections existed", () => {
    expect(
      normalizeSidebarSectionOrder([
        SidebarSection.Collections,
        SidebarSection.SharedWithMe,
        SidebarSection.Starred,
      ])
    ).toEqual([
      SidebarSection.Collections,
      SidebarSection.SharedWithMe,
      SidebarSection.Starred,
      SidebarSection.Recents,
      SidebarSection.Private,
    ]);
  });

  it("drops duplicates and appends the missing sections in default order", () => {
    expect(
      normalizeSidebarSectionOrder([
        SidebarSection.Private,
        SidebarSection.Private,
      ])
    ).toEqual([
      SidebarSection.Private,
      SidebarSection.Starred,
      SidebarSection.Recents,
      SidebarSection.Collections,
      SidebarSection.SharedWithMe,
    ]);
  });
});

describe("moveSidebarSection", () => {
  it("moves the private section above the teamspaces", () => {
    expect(
      moveSidebarSection(
        defaultSidebarSectionOrder,
        SidebarSection.Private,
        "before",
        SidebarSection.Collections
      )
    ).toEqual([
      SidebarSection.Starred,
      SidebarSection.Recents,
      SidebarSection.Private,
      SidebarSection.Collections,
      SidebarSection.SharedWithMe,
    ]);
  });

  it("returns undefined when nothing changes", () => {
    expect(
      moveSidebarSection(
        defaultSidebarSectionOrder,
        SidebarSection.Private,
        "after",
        SidebarSection.SharedWithMe
      )
    ).toBe(undefined);
  });
});
