import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import type { DatabaseField } from "@shared/databases/types";
import { s } from "@shared/styles";
import { Popover, PopoverTrigger } from "~/components/primitives/Popover";
import Switch from "~/components/Switch";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import type { CompactOption } from "../toolbar/components";
import { CompactSelect } from "../toolbar/components";
import { FieldKindIcon } from "./FieldKindIcon";
import { MenuHeading, MenuLabel, MenuPanel, MenuSeparator } from "./components";
import type { PageLayout, PropertyVisibility } from "./pageLayout";
import { propertyVisibility, withPropertyVisibility } from "./pageLayout";

interface Props {
  database: Database;
  /** The properties of row pages, in order. */
  fields: DatabaseField[];
  /** The element that opens the menu. */
  children: React.ReactElement;
}

/**
 * Notion's "Customize page": for every property, always show it, hide it when empty or always
 * hide it on the pages of the rows, and hide every empty property at once. Saved on the database,
 * for everyone.
 *
 * @param props the database, its row page properties and the trigger.
 * @returns the menu with its trigger.
 */
export const CustomizePageMenu = observer(function CustomizePageMenu_({
  database,
  fields,
  children,
}: Props) {
  const { t } = useTranslation();
  const { databases } = useStores();
  const layout = database.settings?.pageLayout;

  const save = React.useCallback(
    (pageLayout: PageLayout) => {
      databases
        .update(database.id, { settings: { pageLayout } })
        .catch((err: unknown) =>
          toast.error(err instanceof Error ? err.message : String(err))
        );
    },
    [database.id, databases]
  );

  const options: CompactOption<PropertyVisibility>[] = [
    { value: "always", label: t("Always show") },
    { value: "hideWhenEmpty", label: t("Hide when empty") },
    { value: "hidden", label: t("Always hide") },
  ];

  return (
    <Popover>
      <PopoverTrigger>{children}</PopoverTrigger>
      <MenuPanel
        aria-label={t("Customize page")}
        side="bottom"
        align="start"
        width={340}
        shrink
      >
        <Toggle>
          <Switch
            label={t("Hide empty properties")}
            checked={!!layout?.hideEmpty}
            onChange={(checked) => save({ ...layout, hideEmpty: checked })}
            inForm={false}
          />
        </Toggle>
        <MenuSeparator />
        <MenuHeading>{t("Properties")}</MenuHeading>
        {fields.map((field) => (
          <Row key={field.id}>
            <FieldKindIcon field={field} size={16} />
            <MenuLabel>{field.name}</MenuLabel>
            <CompactSelect
              ariaLabel={t("Visibility of {{ name }}", { name: field.name })}
              value={propertyVisibility(layout, field.id)}
              options={options}
              width={150}
              onChange={(visibility) =>
                save(withPropertyVisibility(layout, field.id, visibility))
              }
            />
          </Row>
        ))}
      </MenuPanel>
    </Popover>
  );
});

const Toggle = styled.div`
  padding: 6px 12px;
  font-size: 14px;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  font-size: 14px;
  color: ${s("text")};

  svg {
    flex-shrink: 0;
    fill: ${s("textSecondary")};
  }
`;
