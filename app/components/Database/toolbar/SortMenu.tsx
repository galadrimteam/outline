import { observer } from "mobx-react";
import { PlusIcon, TrashIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  DatabaseField,
  DatabaseSort,
  DatabaseSortItem,
  DatabaseSortOrder,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { s } from "@shared/styles";
import NudeButton from "~/components/NudeButton";
import Tooltip from "~/components/Tooltip";
import type Database from "~/models/Database";
import { orderedFields } from "./columns";
import { CompactSelect, FieldPicker, PanelAction } from "./components";
import { FieldKindIcon } from "../fields/FieldKindIcon";
import { SortableRows } from "./SortableRows";

interface Props {
  /** The database whose rows are sorted. */
  database: Database;
  /** The sort being edited; null when there is none. */
  sort: DatabaseSort | null;
  /** Called with the edited sort; null once the last rule is removed. */
  onChange: (sort: DatabaseSort | null) => void;
}

/**
 * Notion-like sort editor: several « property · direction » rules applied in
 * order, reordered by dragging; opens on the property list when empty.
 *
 * @param props the sort and the change callback.
 * @returns the editor.
 */
export const SortMenu = observer(function SortMenu({
  database,
  sort,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const fields = React.useMemo(
    () =>
      orderedFields(database.fields ?? [], { columnMeta: {} }).filter(
        isSortableField
      ),
    [database.fields]
  );
  const items = React.useMemo(() => sort?.sortObjs ?? [], [sort]);

  const setItems = React.useCallback(
    (sortObjs: DatabaseSortItem[]) =>
      onChange(
        sortObjs.length ? { sortObjs, manualSort: sort?.manualSort } : null
      ),
    [onChange, sort?.manualSort]
  );

  const handlePick = React.useCallback(
    (field: DatabaseField) => {
      if (items.some((item) => item.fieldId === field.id)) {
        return;
      }
      setItems([...items, { fieldId: field.id, order: "asc" }]);
    },
    [items, setItems]
  );

  const handleAdd = React.useCallback(() => {
    const field = fields.find(
      (f) => !items.some((item) => item.fieldId === f.id)
    );
    if (field) {
      handlePick(field);
    }
  }, [fields, items, handlePick]);

  const handleReorder = React.useCallback(
    (ids: string[]) =>
      setItems(
        ids
          .map((id) => items.find((item) => item.fieldId === id))
          .filter((item): item is DatabaseSortItem => !!item)
      ),
    [items, setItems]
  );

  if (!items.length) {
    return (
      <Wrapper>
        <FieldPicker
          fields={fields}
          onSelect={handlePick}
          placeholder={t("Sort by…")}
        />
      </Wrapper>
    );
  }

  const directionOptions: { value: DatabaseSortOrder; label: string }[] = [
    { value: "asc", label: t("Ascending") },
    { value: "desc", label: t("Descending") },
  ];

  return (
    <Wrapper>
      <SortableRows
        ids={items.map((item) => item.fieldId)}
        onReorder={handleReorder}
        renderRow={(fieldId, handle) => {
          const index = items.findIndex((item) => item.fieldId === fieldId);
          const item = items[index];
          const available = fields.filter(
            (f) =>
              f.id === fieldId || !items.some((other) => other.fieldId === f.id)
          );
          return (
            <Row>
              {handle}
              <CompactSelect
                ariaLabel={t("Property")}
                value={database.fieldById(fieldId) ? fieldId : undefined}
                placeholder={t("Deleted property")}
                options={available.map((f) => ({
                  value: f.id,
                  label: f.name,
                  icon: <FieldKindIcon field={f} size={16} />,
                }))}
                onChange={(next) =>
                  setItems(
                    items.map((other, i) =>
                      i === index ? { ...other, fieldId: next } : other
                    )
                  )
                }
              />
              <CompactSelect
                ariaLabel={t("Direction")}
                value={item.order}
                options={directionOptions}
                onChange={(order) =>
                  setItems(
                    items.map((other, i) =>
                      i === index ? { ...other, order } : other
                    )
                  )
                }
              />
              <Tooltip content={t("Remove sort")}>
                <Remove
                  type="button"
                  size={28}
                  aria-label={t("Remove sort")}
                  onClick={() => setItems(items.filter((_, i) => i !== index))}
                >
                  <TrashIcon size={18} />
                </Remove>
              </Tooltip>
            </Row>
          );
        }}
      />
      <Footer>
        {items.length < fields.length && (
          <PanelAction type="button" onClick={handleAdd}>
            <PlusIcon size={18} />
            {t("Add sort")}
          </PanelAction>
        )}
        <PanelAction type="button" $danger onClick={() => onChange(null)}>
          <TrashIcon size={18} />
          {t("Delete sort")}
        </PanelAction>
      </Footer>
    </Wrapper>
  );
});

/**
 * Whether rows can be sorted by a field.
 *
 * @param field the field.
 * @returns false for buttons and attachments.
 */
function isSortableField(field: DatabaseField): boolean {
  return (
    field.type !== DatabaseFieldType.Button &&
    field.type !== DatabaseFieldType.Attachment
  );
}

const Wrapper = styled.div`
  padding: 0 6px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 18px minmax(120px, 1fr) 128px 28px;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
`;

const Footer = styled.div`
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid ${s("divider")};
`;

const Remove = styled(NudeButton)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${s("textTertiary")};

  &:hover,
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }
`;
