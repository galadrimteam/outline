import { observer } from "mobx-react";
import {
  BackIcon,
  DuplicateIcon,
  EditIcon,
  HiddenIcon,
  InsertLeftIcon,
  InsertRightIcon,
  PinIcon,
  SortAscendingIcon,
  SortDescendingIcon,
  TrashIcon,
} from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type {
  DatabaseField,
  DatabaseSortOrder,
  DatabaseView,
} from "@shared/databases/types";
import ConfirmationDialog from "~/components/ConfirmationDialog";
import { Popover, PopoverTrigger } from "~/components/primitives/Popover";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { visibilityPatch } from "../toolbar/columns";
import { FilterIcon } from "../toolbar/icons";
import { viewDrafts } from "../toolbar/viewDrafts";
import { FieldKindIcon } from "./FieldKindIcon";
import { FieldKindList } from "./FieldKindList";
import { FieldOptionsPanel } from "./FieldOptionsPanel";
import {
  MenuHint,
  MenuInput,
  MenuItem,
  MenuLabel,
  MenuPanel,
  MenuSeparator,
  MenuTextarea,
} from "./components";
import {
  convertFieldToKind,
  createFieldOfKind,
  deleteField,
  duplicateField,
  updateField,
} from "./fieldActions";
import type { FieldKindId } from "./fieldTypes";
import { fieldKindLabel, fieldKindOf, isLossyConversion } from "./fieldTypes";

type Panel = "main" | "type" | "options" | "description";

interface Props {
  database: Database;
  field: DatabaseField;
  /** The view the menu acts on; absent on a row page, which has no sort, filter or columns. */
  view?: DatabaseView;
  /** Whether the reader may only look. */
  readOnly: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the filter of the view on this property; the item is hidden without it. */
  onFilter?: (fieldId: string) => void;
  /** Sorts by this property; a temporary sort of the view is set without it. */
  onSort?: (fieldId: string, order: DatabaseSortOrder) => void;
  /** Called with a property created next to this one (insert left/right, duplicate). */
  onInserted?: (fieldId: string) => void;
  /** The element that opens the menu. */
  children: React.ReactElement;
}

/**
 * The menu of a property, from its column header or its row page line: rename, change the type,
 * edit options and description, sort, filter, hide, freeze, insert, duplicate and delete.
 *
 * @param props the property, its view and the callbacks.
 * @returns the menu with its trigger.
 */
export const FieldHeaderMenu = observer(function FieldHeaderMenu_({
  database,
  field,
  view,
  readOnly,
  open,
  onOpenChange,
  onFilter,
  onSort,
  onInserted,
  children,
}: Props) {
  const { t } = useTranslation();
  const stores = useStores();
  const [panel, setPanel] = React.useState<Panel>("main");
  const [name, setName] = React.useState(field.name);
  const [description, setDescription] = React.useState(field.description ?? "");
  const kind = fieldKindOf(field);
  const canEditSchema = !readOnly;
  const canEditView = !!view && !readOnly && !view.isLocked;
  const hasOptions =
    kind === "select" || kind === "multiSelect" || kind === "status";

  React.useEffect(() => {
    if (open) {
      setPanel("main");
      setName(field.name);
      setDescription(field.description ?? "");
    }
  }, [open, field.name, field.description]);

  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleRename = React.useCallback(() => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== field.name) {
      void updateField(stores, database, field, { name: trimmed });
    }
  }, [database, field, name, stores]);

  const handleSaveDescription = React.useCallback(async () => {
    const next = description.trim();
    if (next !== (field.description ?? "")) {
      await updateField(stores, database, field, { description: next || null });
    }
    setPanel("main");
  }, [database, description, field, stores]);

  const handlePickKind = React.useCallback(
    (next: FieldKindId) => {
      close();
      if (next === kind) {
        return;
      }
      const convert = () =>
        convertFieldToKind(stores, database, field, next, t);
      if (!isLossyConversion(field, next)) {
        void convert();
        return;
      }
      stores.dialogs.openModal({
        title: t("Change the property type?"),
        content: (
          <ConfirmationDialog
            danger
            submitText={t("Change type")}
            onSubmit={async () => {
              await convert();
            }}
          >
            {t(
              "Converting “{{ name }}” to {{ type }} may erase values that do not fit the new type.",
              { name: field.name, type: fieldKindLabel(next, t) }
            )}
          </ConfirmationDialog>
        ),
      });
    },
    [close, database, field, kind, stores, t]
  );

  const handleSort = React.useCallback(
    (order: DatabaseSortOrder) => {
      close();
      if (onSort) {
        onSort(field.id, order);
        return;
      }
      if (view) {
        viewDrafts.set(database.id, view.id, {
          sort: { sortObjs: [{ fieldId: field.id, order }] },
        });
      }
    },
    [close, database.id, field.id, onSort, view]
  );

  const handleHide = React.useCallback(() => {
    close();
    if (view) {
      void stores.databases
        .updateView(database.id, view.id, {
          columnMeta: { [field.id]: visibilityPatch(view, false) },
        })
        .catch(() => undefined);
    }
  }, [close, database.id, field.id, stores, view]);

  const handleFreeze = React.useCallback(() => {
    close();
    if (view) {
      const frozen = view.options.frozenFieldId === field.id;
      void stores.databases
        .updateView(database.id, view.id, {
          options: { frozenFieldId: frozen ? undefined : field.id },
        })
        .catch(() => undefined);
    }
  }, [close, database.id, field.id, stores, view]);

  const handleInsert = React.useCallback(
    async (side: "left" | "right") => {
      close();
      if (!view) {
        return;
      }
      const created = await createFieldOfKind(
        stores,
        database,
        { name: t("Property"), kind: "text" },
        { view, anchorFieldId: field.id, side },
        t
      );
      if (created) {
        onInserted?.(created.id);
      }
    },
    [close, database, field.id, onInserted, stores, t, view]
  );

  const handleDuplicate = React.useCallback(async () => {
    close();
    if (!view) {
      return;
    }
    const created = await duplicateField(stores, database, field, view);
    if (created) {
      onInserted?.(created.id);
    }
  }, [close, database, field, onInserted, stores, view]);

  const handleDelete = React.useCallback(() => {
    close();
    stores.dialogs.openModal({
      title: t("Delete property?"),
      content: (
        <ConfirmationDialog
          danger
          submitText={t("Delete")}
          onSubmit={async () => {
            await deleteField(stores, database, field);
          }}
        >
          {t(
            "The property “{{ name }}” and its values in every row will be deleted.",
            { name: field.name }
          )}
        </ConfirmationDialog>
      ),
    });
  }, [close, database, field, stores, t]);

  const stop = (event: React.KeyboardEvent) => event.stopPropagation();

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger>{children}</PopoverTrigger>
      <MenuPanel
        aria-label={t("Property menu")}
        side="bottom"
        align="start"
        width={260}
        shrink
        onKeyDown={stop}
      >
        {panel !== "main" && (
          <MenuItem type="button" onClick={() => setPanel("main")}>
            <BackIcon size={18} />
            <MenuLabel>{field.name}</MenuLabel>
          </MenuItem>
        )}

        {panel === "type" && (
          <FieldKindList current={kind} onPick={handlePickKind} />
        )}

        {panel === "options" && (
          <FieldOptionsPanel database={database} field={field} />
        )}

        {panel === "description" && (
          <>
            <MenuTextarea
              autoFocus
              aria-label={t("Description")}
              placeholder={t("Describe this property…")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <MenuItem
              type="button"
              onClick={() => void handleSaveDescription()}
            >
              <MenuLabel>{t("Save")}</MenuLabel>
            </MenuItem>
          </>
        )}

        {panel === "main" && (
          <>
            {canEditSchema ? (
              <MenuInput
                autoFocus
                aria-label={t("Property name")}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={handleRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleRename();
                    close();
                  }
                }}
              />
            ) : (
              <MenuItem as="div">
                <FieldKindIcon field={field} />
                <MenuLabel>{field.name}</MenuLabel>
              </MenuItem>
            )}
            {field.description && !canEditSchema && (
              <MenuItem as="div">
                <MenuHint>{field.description}</MenuHint>
              </MenuItem>
            )}

            {canEditSchema && (
              <>
                <MenuItem type="button" onClick={() => setPanel("type")}>
                  <FieldKindIcon field={field} />
                  <MenuLabel>{t("Type")}</MenuLabel>
                  <MenuHint>
                    {kind ? fieldKindLabel(kind, t) : field.type}
                  </MenuHint>
                </MenuItem>
                {hasOptions && (
                  <MenuItem type="button" onClick={() => setPanel("options")}>
                    <EditIcon size={18} />
                    <MenuLabel>{t("Edit options")}</MenuLabel>
                  </MenuItem>
                )}
                <MenuItem type="button" onClick={() => setPanel("description")}>
                  <EditIcon size={18} />
                  <MenuLabel>
                    {field.description
                      ? t("Edit description")
                      : t("Add a description")}
                  </MenuLabel>
                </MenuItem>
              </>
            )}

            {view && (
              <>
                <MenuSeparator />
                <MenuItem type="button" onClick={() => handleSort("asc")}>
                  <SortAscendingIcon size={18} />
                  <MenuLabel>{t("Sort ascending")}</MenuLabel>
                </MenuItem>
                <MenuItem type="button" onClick={() => handleSort("desc")}>
                  <SortDescendingIcon size={18} />
                  <MenuLabel>{t("Sort descending")}</MenuLabel>
                </MenuItem>
                {onFilter && (
                  <MenuItem
                    type="button"
                    onClick={() => {
                      close();
                      onFilter(field.id);
                    }}
                  >
                    <FilterIcon size={18} />
                    <MenuLabel>{t("Filter")}</MenuLabel>
                  </MenuItem>
                )}
              </>
            )}

            {canEditView && (
              <>
                <MenuSeparator />
                {!field.isPrimary && (
                  <MenuItem type="button" onClick={handleHide}>
                    <HiddenIcon size={18} />
                    <MenuLabel>{t("Hide in view")}</MenuLabel>
                  </MenuItem>
                )}
                <MenuItem type="button" onClick={handleFreeze}>
                  <PinIcon size={18} />
                  <MenuLabel>
                    {view?.options.frozenFieldId === field.id
                      ? t("Unfreeze columns")
                      : t("Freeze up to this column")}
                  </MenuLabel>
                </MenuItem>
              </>
            )}

            {canEditSchema && view && (
              <>
                <MenuItem
                  type="button"
                  onClick={() => void handleInsert("left")}
                >
                  <InsertLeftIcon size={18} />
                  <MenuLabel>{t("Insert left")}</MenuLabel>
                </MenuItem>
                <MenuItem
                  type="button"
                  onClick={() => void handleInsert("right")}
                >
                  <InsertRightIcon size={18} />
                  <MenuLabel>{t("Insert right")}</MenuLabel>
                </MenuItem>
                <MenuItem type="button" onClick={() => void handleDuplicate()}>
                  <DuplicateIcon size={18} />
                  <MenuLabel>{t("Duplicate property")}</MenuLabel>
                </MenuItem>
              </>
            )}

            {canEditSchema && !field.isPrimary && (
              <MenuItem type="button" $danger onClick={handleDelete}>
                <TrashIcon size={18} />
                <MenuLabel>{t("Delete property")}</MenuLabel>
              </MenuItem>
            )}
          </>
        )}
      </MenuPanel>
    </Popover>
  );
});
