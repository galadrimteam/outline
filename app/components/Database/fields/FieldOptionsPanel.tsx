import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { DatabaseField } from "@shared/databases/types";
import { DatabaseStatusGroup } from "@shared/databases/types";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import {
  appendChoice,
  groupChoices,
  hasChoice,
  isStatusField,
  renameStatusChoice,
} from "../cells/choices";
import { ChoiceOptionsList } from "../cells/components/ChoiceOptionsList";
import { saveChoices } from "../cells/saveChoices";
import { MenuInput } from "./components";

interface Props {
  database: Database;
  field: DatabaseField;
}

/**
 * The options of a select, multi select or status property, from its menu: add, reorder, and
 * rename, recolour or delete each one.
 *
 * @param props the database and the property.
 * @returns the panel.
 */
export const FieldOptionsPanel = observer(function FieldOptionsPanel_({
  database,
  field,
}: Props) {
  const { t } = useTranslation();
  const stores = useStores();
  const [name, setName] = React.useState("");
  const choices = React.useMemo(
    () => field.options.choices ?? [],
    [field.options.choices]
  );
  const status = isStatusField(field);
  const sections = status
    ? groupChoices(choices, field.meta?.statusGroups)
    : [{ group: null, choices }];

  const handleAdd = React.useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || hasChoice(choices, trimmed)) {
      return;
    }
    const saved = await saveChoices(
      stores,
      database,
      field,
      appendChoice(choices, trimmed),
      status
        ? renameStatusChoice(
            field.meta?.statusGroups ?? {},
            null,
            trimmed,
            DatabaseStatusGroup.ToDo
          )
        : undefined
    );
    if (saved) {
      setName("");
    }
  }, [choices, database, field, name, status, stores]);

  return (
    <div>
      <MenuInput
        autoFocus
        placeholder={t("Add an option…")}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            void handleAdd();
          }
        }}
      />
      <ChoiceOptionsList
        database={database}
        field={field}
        sections={sections}
        selected={[]}
        reorderable
        onHover={noop}
        onToggle={noop}
      />
    </div>
  );
});

function noop() {
  return undefined;
}
