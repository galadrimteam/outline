import { observer } from "mobx-react";
import { EyeIcon, HiddenIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { DatabaseColumnMeta, DatabaseView } from "@shared/databases/types";
import { ellipsis, s } from "@shared/styles";
import NudeButton from "~/components/NudeButton";
import Tooltip from "~/components/Tooltip";
import type Database from "~/models/Database";
import {
  isFieldVisible,
  orderedFields,
  orderPatch,
  visibilityPatch,
} from "./columns";
import { PanelHeader, SmallInput } from "./components";
import { FieldKindIcon } from "../fields/FieldKindIcon";
import { SortableRows } from "./SortableRows";
import type { DatabaseViewPatch } from "./useViewUpdate";

interface Props {
  /** The database of the view. */
  database: Database;
  /** The view whose properties are shown or hidden. */
  view: DatabaseView;
  /** Saves changes to the view for everyone. */
  onUpdate: (patch: DatabaseViewPatch) => void;
}

/**
 * Notion-like « Properties » panel: every property with an eye to show or hide
 * it in the view (columns of a table, lines of a card) and a handle to reorder.
 * The title property is always shown.
 *
 * @param props the view and the save callback.
 * @returns the panel.
 */
export const PropertiesMenu = observer(function PropertiesMenu({
  database,
  view,
  onUpdate,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = React.useState("");
  const fields = orderedFields(database.fields ?? [], view);
  const term = search.trim().toLocaleLowerCase();
  const toggleable = fields.filter((field) => !field.isPrimary);
  const anyHidden = toggleable.some((field) => !isFieldVisible(view, field));

  const handleToggle = React.useCallback(
    (fieldId: string, visible: boolean) =>
      onUpdate({ columnMeta: { [fieldId]: visibilityPatch(view, visible) } }),
    [onUpdate, view]
  );

  const handleToggleAll = React.useCallback(() => {
    const columnMeta: Record<string, Partial<DatabaseColumnMeta>> = {};
    for (const field of toggleable) {
      columnMeta[field.id] = visibilityPatch(view, anyHidden);
    }
    onUpdate({ columnMeta });
  }, [onUpdate, toggleable, view, anyHidden]);

  const handleReorder = React.useCallback(
    (ids: string[]) => onUpdate({ columnMeta: orderPatch(view, ids) }),
    [onUpdate, view]
  );

  const shownFields = term
    ? fields.filter((field) => field.name.toLocaleLowerCase().includes(term))
    : fields;

  return (
    <Wrapper>
      <SearchInput
        autoFocus
        value={search}
        placeholder={t("Search for a property…")}
        aria-label={t("Search for a property…")}
        onChange={(ev) => setSearch(ev.target.value)}
      />
      <PanelHeader>
        <Grow>{t("Properties")}</Grow>
        {!!toggleable.length && (
          <TextButton type="button" onClick={handleToggleAll}>
            {anyHidden ? t("Show all") : t("Hide all")}
          </TextButton>
        )}
      </PanelHeader>
      <SortableRows
        ids={shownFields.map((field) => field.id)}
        disabled={!!term}
        onReorder={(ids) => {
          const moved = new Set(ids);
          handleReorder([
            ...fields.filter((f) => f.isPrimary).map((f) => f.id),
            ...ids.filter((id) => !database.fieldById(id)?.isPrimary),
            ...fields.filter((f) => !moved.has(f.id)).map((f) => f.id),
          ]);
        }}
        renderRow={(fieldId, handle) => {
          const field = database.fieldById(fieldId);
          if (!field) {
            return null;
          }
          const visible = isFieldVisible(view, field);
          return (
            <Row $muted={!visible}>
              {field.isPrimary ? <HandleSpacer /> : handle}
              <FieldKindIcon field={field} size={18} />
              <Name>{field.name}</Name>
              {field.isPrimary ? (
                <Tooltip content={t("The title is always shown")}>
                  <Toggle
                    type="button"
                    size={28}
                    disabled
                    aria-label={t("Shown")}
                  >
                    <EyeIcon size={18} />
                  </Toggle>
                </Tooltip>
              ) : (
                <Tooltip
                  content={visible ? t("Hide in view") : t("Show in view")}
                >
                  <Toggle
                    type="button"
                    size={28}
                    aria-pressed={visible}
                    aria-label={
                      visible
                        ? t("Hide {{ name }}", { name: field.name })
                        : t("Show {{ name }}", { name: field.name })
                    }
                    onClick={() => handleToggle(field.id, !visible)}
                  >
                    {visible ? <EyeIcon size={18} /> : <HiddenIcon size={18} />}
                  </Toggle>
                </Tooltip>
              )}
            </Row>
          );
        }}
      />
    </Wrapper>
  );
});

const Wrapper = styled.div`
  padding: 0 6px;
`;

const SearchInput = styled(SmallInput)`
  width: 100%;
  margin-bottom: 6px;
`;

const Grow = styled.span`
  flex: 1;
`;

const TextButton = styled.button`
  padding: 0 4px;
  border: 0;
  background: none;
  color: ${s("accent")};
  font-size: 12px;
  font-weight: 500;
  cursor: var(--pointer);
`;

const Row = styled.div<{ $muted: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 2px;
  color: ${(props) =>
    props.$muted ? props.theme.textTertiary : props.theme.text};
  font-size: 14px;

  > svg {
    flex-shrink: 0;
    color: ${s("textTertiary")};
  }
`;

const HandleSpacer = styled.span`
  width: 18px;
  flex-shrink: 0;
`;

const Name = styled.span`
  flex: 1;
  min-width: 0;
  ${ellipsis()}
`;

const Toggle = styled(NudeButton)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${s("textTertiary")};

  &:hover:not(:disabled),
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;
