import { renderToString } from "react-dom/server";
import type { DatabaseField } from "@shared/databases/types";
import {
  DatabaseFieldType,
  DatabaseStatusGroup,
} from "@shared/databases/types";
import { makeField } from "../views/TableView/testFixtures";
import { FieldKindIcon } from "./FieldKindIcon";

function field(overrides: Partial<DatabaseField>): DatabaseField {
  return makeField({
    name: "Coût",
    type: DatabaseFieldType.SingleSelect,
    ...overrides,
  });
}

describe("FieldKindIcon", () => {
  it("shows the icon given to the property instead of its type icon", () => {
    const html = renderToString(
      <FieldKindIcon field={field({ meta: { icon: "💵" } })} size={16} />
    );
    expect(html).toContain("💵");
  });

  it("tells a status from a select, as Notion does", () => {
    const select = renderToString(<FieldKindIcon field={field({})} />);
    const status = renderToString(
      <FieldKindIcon
        field={field({
          meta: { statusGroups: { Done: DatabaseStatusGroup.Complete } },
        })}
      />
    );
    expect(select).not.toEqual(status);
  });

  it("draws relations and formulas with their own pictograms", () => {
    const link = renderToString(
      <FieldKindIcon field={field({ type: DatabaseFieldType.Link })} />
    );
    const formula = renderToString(
      <FieldKindIcon field={field({ type: DatabaseFieldType.Formula })} />
    );
    expect(link).toContain("<svg");
    expect(formula).toContain("<svg");
    expect(link).not.toEqual(formula);
  });
});
