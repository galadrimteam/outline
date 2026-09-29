import { Provider } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import { vi } from "vitest";
import type { DatabaseField, DatabaseFilter } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { light } from "@shared/styles/theme";
import { ActionContextProvider } from "~/hooks/useActionContext";
import stores from "~/stores";
import { FilterBuilder, filterPopoverWidth } from "./FilterBuilder";

const databaseId = "30000000-0000-4000-8000-000000000007";

const ticket: DatabaseField = {
  id: "ticket",
  name: "Ticket",
  type: DatabaseFieldType.SingleLineText,
  options: {},
  isPrimary: true,
  isComputed: false,
  isLookup: false,
  cellValueType: "string",
  isMultipleCellValue: false,
};

const rule = { fieldId: "ticket", operator: "contains" as const, value: "a" };

const nested: DatabaseFilter = {
  conjunction: "and",
  filterSet: [
    rule,
    {
      conjunction: "and",
      filterSet: [rule, { conjunction: "and", filterSet: [rule] }],
    },
  ],
};

describe("filterPopoverWidth", () => {
  it("grows with each nested group", () => {
    expect(filterPopoverWidth(null)).toBe(300);
    expect(filterPopoverWidth({ conjunction: "and", filterSet: [] })).toBe(300);
    expect(filterPopoverWidth({ conjunction: "and", filterSet: [rule] })).toBe(
      680
    );
    expect(filterPopoverWidth(nested)).toBe(872);
  });
});

describe("FilterBuilder", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("puts a group's delete button with its actions, away from its rules", async () => {
    const database = stores.databases.add({
      id: databaseId,
      title: "Suivi",
      icon: null,
      collectionId: "40000000-0000-4000-8000-000000000001",
      documentId: null,
      url: `/db/${databaseId}`,
      settings: {},
      fields: [ticket],
      views: [],
    });
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <Provider rootStore={stores}>
          <MemoryRouter>
            <ThemeProvider theme={light}>
              <ActionContextProvider value={{}}>
                <FilterBuilder
                  database={database}
                  filter={nested}
                  onChange={onChange}
                  records={[]}
                />
              </ActionContextProvider>
            </ThemeProvider>
          </MemoryRouter>
        </Provider>
      );
    });

    const removeGroups = Array.from(
      container.querySelectorAll("button[aria-label='Remove group']")
    );
    expect(removeGroups).toHaveLength(2);
    for (const button of removeGroups) {
      const actions = button.closest("div")?.parentElement;
      expect(actions?.textContent).toContain("Add filter rule");
      expect(
        actions?.querySelector("button[aria-label='Remove rule']")
      ).toBeNull();
    }

    // The innermost group's actions come first, inside its parent's rules.
    await act(async () => {
      (removeGroups[0] as HTMLButtonElement).click();
    });
    expect(onChange).toHaveBeenCalledWith({
      conjunction: "and",
      filterSet: [rule, { conjunction: "and", filterSet: [rule] }],
    });
  });
});
