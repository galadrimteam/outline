import * as React from "react";
import { useTranslation } from "react-i18next";
import type { DatabaseView } from "@shared/databases/types";
import { Popover, PopoverTrigger } from "~/components/primitives/Popover";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { MenuInput, MenuPanel } from "./components";
import { createFieldOfKind } from "./fieldActions";
import { FieldKindList } from "./FieldKindList";
import type { FieldKindId } from "./fieldTypes";

interface Props {
  database: Database;
  /** The view the new property is shown in, at its end; absent on a row page. */
  view?: DatabaseView;
  /** Called with the new property. */
  onCreated?: (fieldId: string) => void;
  /** The element that opens the picker ("+" header, "Add a property"). */
  children: React.ReactElement;
}

/**
 * Adds a property: a name and a type picked from Notion's list.
 *
 * @param props the database, the view and the trigger.
 * @returns the picker with its trigger.
 */
export function AddFieldButton({ database, view, onCreated, children }: Props) {
  const { t } = useTranslation();
  const stores = useStores();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");

  const handleOpenChange = React.useCallback((next: boolean) => {
    if (next) {
      setName("");
    }
    setOpen(next);
  }, []);

  const handlePick = React.useCallback(
    async (kind: FieldKindId) => {
      setOpen(false);
      const created = await createFieldOfKind(
        stores,
        database,
        { name: name.trim() || t("Property"), kind },
        view ? { view } : undefined,
        t
      );
      if (created) {
        onCreated?.(created.id);
      }
    },
    [database, name, onCreated, stores, t, view]
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger>{children}</PopoverTrigger>
      <MenuPanel
        aria-label={t("Add a property")}
        side="bottom"
        align="end"
        width={260}
        shrink
        onKeyDown={(event) => event.stopPropagation()}
      >
        <MenuInput
          autoFocus
          aria-label={t("Property name")}
          placeholder={t("Property name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handlePick("text");
            }
          }}
        />
        <FieldKindList onPick={(kind) => void handlePick(kind)} />
      </MenuPanel>
    </Popover>
  );
}
