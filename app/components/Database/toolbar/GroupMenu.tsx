import { observer } from "mobx-react";
import { EyeIcon, HiddenIcon, PlusIcon, TrashIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  DatabaseField,
  DatabaseGroup,
  DatabaseSortOrder,
  DatabaseView,
} from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import { ellipsis, s } from "@shared/styles";
import NudeButton from "~/components/NudeButton";
import Switch from "~/components/Switch";
import Tooltip from "~/components/Tooltip";
import type Database from "~/models/Database";
import {
  boardColumns,
  EMPTY_STACK,
  isStackable,
  toggleStack,
} from "../boardModel";
import { getCell } from "../cells/registry";
import { orderedFields } from "./columns";
import {
  CompactSelect,
  FieldPicker,
  PanelAction,
  PanelDivider,
  PanelHeader,
} from "./components";
import { FieldKindIcon } from "../fields/FieldKindIcon";
import { SortableRows } from "./SortableRows";
import type { DatabaseViewPatch } from "./useViewUpdate";

interface Props {
  /** The database of the view. */
  database: Database;
  /** The view whose grouping is edited. */
  view: DatabaseView;
  /** Saves changes to the view for everyone. */
  onUpdate: (patch: DatabaseViewPatch) => void;
}

/** Levels of grouping each layout draws. */
const MAX_LEVELS: Partial<Record<DatabaseLayout, number>> = {
  [DatabaseLayout.Table]: 3,
  [DatabaseLayout.Gallery]: 1,
  [DatabaseLayout.List]: 1,
  [DatabaseLayout.Timeline]: 1,
};

/**
 * Notion-like grouping settings. A board groups by its column field: the menu
 * changes it, adds a sub-group (swimlanes), hides empty groups and orders or
 * hides columns by hand. Other layouts group by up to three fields (tables) or
 * one (gallery, list, timeline).
 *
 * @param props the view and the save callback.
 * @returns the menu.
 */
export const GroupMenu = observer(function GroupMenu({
  database,
  view,
  onUpdate,
}: Props) {
  if (view.layout === DatabaseLayout.Board) {
    return (
      <BoardGroupMenu database={database} view={view} onUpdate={onUpdate} />
    );
  }
  return (
    <LevelsGroupMenu database={database} view={view} onUpdate={onUpdate} />
  );
});

/**
 * Whether a layout has grouping settings.
 *
 * @param layout the layout of the view.
 * @returns true for board, table, gallery, list and timeline.
 */
export function layoutSupportsGrouping(layout: DatabaseLayout): boolean {
  return layout === DatabaseLayout.Board || !!MAX_LEVELS[layout];
}

const LevelsGroupMenu = observer(function LevelsGroupMenu({
  database,
  view,
  onUpdate,
}: Props) {
  const { t } = useTranslation();
  const fields = React.useMemo(
    () => orderedFields(database.fields ?? [], view).filter(isGroupableField),
    [database.fields, view]
  );
  const levels = view.group ?? [];
  const maxLevels = MAX_LEVELS[view.layout] ?? 1;
  const shown = levels.slice(0, maxLevels);

  const setLevels = React.useCallback(
    (group: DatabaseGroup) => onUpdate({ group: group.length ? group : null }),
    [onUpdate]
  );

  if (!shown.length) {
    return (
      <Wrapper>
        <FieldPicker
          fields={fields}
          placeholder={t("Group by…")}
          onSelect={(field) => setLevels([{ fieldId: field.id, order: "asc" }])}
        />
      </Wrapper>
    );
  }

  const orderOptions: { value: DatabaseSortOrder; label: string }[] = [
    { value: "asc", label: t("Ascending") },
    { value: "desc", label: t("Descending") },
  ];

  return (
    <Wrapper>
      {shown.map((level, index) => {
        const available = fields.filter(
          (f) =>
            f.id === level.fieldId ||
            !shown.some((other) => other.fieldId === f.id)
        );
        return (
          <LevelRow key={index}>
            <LevelLabel>
              {index === 0 ? t("Group by") : t("Then by")}
            </LevelLabel>
            <CompactSelect
              ariaLabel={t("Property")}
              value={
                database.fieldById(level.fieldId) ? level.fieldId : undefined
              }
              placeholder={t("Deleted property")}
              options={available.map((f) => ({
                value: f.id,
                label: f.name,
                icon: <FieldKindIcon field={f} size={16} />,
              }))}
              onChange={(fieldId) =>
                setLevels(
                  shown.map((other, i) =>
                    i === index ? { ...other, fieldId } : other
                  )
                )
              }
            />
            <CompactSelect
              ariaLabel={t("Direction")}
              value={level.order}
              options={orderOptions}
              onChange={(order) =>
                setLevels(
                  shown.map((other, i) =>
                    i === index ? { ...other, order } : other
                  )
                )
              }
            />
            <Tooltip content={t("Remove group")}>
              <IconButton
                type="button"
                size={28}
                aria-label={t("Remove group")}
                onClick={() => setLevels(shown.filter((_, i) => i !== index))}
              >
                <TrashIcon size={18} />
              </IconButton>
            </Tooltip>
          </LevelRow>
        );
      })}
      <Footer>
        {shown.length < maxLevels && shown.length < fields.length && (
          <PanelAction
            type="button"
            onClick={() => {
              const field = fields.find(
                (f) => !shown.some((level) => level.fieldId === f.id)
              );
              if (field) {
                setLevels([...shown, { fieldId: field.id, order: "asc" }]);
              }
            }}
          >
            <PlusIcon size={18} />
            {t("Add subgroup")}
          </PanelAction>
        )}
        <PanelAction type="button" $danger onClick={() => setLevels([])}>
          <TrashIcon size={18} />
          {t("Remove grouping")}
        </PanelAction>
      </Footer>
    </Wrapper>
  );
});

const BoardGroupMenu = observer(function BoardGroupMenu({
  database,
  view,
  onUpdate,
}: Props) {
  const { t } = useTranslation();
  const fields = database.fields ?? [];
  const stackFields = fields.filter((f) => isStackable(f) && !f.isLookup);
  const subGroupFields = orderedFields(fields, view).filter(
    (f) => isGroupableField(f) && f.id !== view.options.stackFieldId
  );
  const stackField = view.options.stackFieldId
    ? database.fieldById(view.options.stackFieldId)
    : undefined;
  const columns = stackField
    ? boardColumns(stackField, view)
    : { visible: [], hidden: [] };
  const visibleKeys = columns.visible.map((column) => column.key);
  const hiddenKeys = columns.hidden.map((column) => column.key);

  const handleToggle = (key: string) =>
    onUpdate({
      overrides: {
        hiddenStacks: toggleStack(view.overrides.hiddenStacks, key),
      },
    });

  const renderColumn = (
    key: string,
    handle: React.ReactNode,
    hidden: boolean
  ) =>
    stackField ? (
      <StackRow $hidden={hidden}>
        {handle ?? <HandleSpacer />}
        <StackName>
          {key === EMPTY_STACK ? (
            t("No {{ name }}", { name: stackField.name })
          ) : (
            <StackLabel field={stackField} name={key} database={database} />
          )}
        </StackName>
        <Tooltip content={hidden ? t("Show group") : t("Hide group")}>
          <IconButton
            type="button"
            size={28}
            aria-pressed={!hidden}
            aria-label={hidden ? t("Show group") : t("Hide group")}
            onClick={() => handleToggle(key)}
          >
            {hidden ? <HiddenIcon size={18} /> : <EyeIcon size={18} />}
          </IconButton>
        </Tooltip>
      </StackRow>
    ) : null;

  return (
    <Wrapper>
      <SettingRow>
        <SettingLabel>{t("Group by")}</SettingLabel>
        <CompactSelect
          ariaLabel={t("Group by")}
          value={stackField?.id}
          placeholder={t("Select a property")}
          options={stackFields.map((f) => ({
            value: f.id,
            label: f.name,
            icon: <FieldKindIcon field={f} size={16} />,
          }))}
          onChange={(stackFieldId) =>
            onUpdate({
              options: { stackFieldId },
              overrides: { stackOrder: [], hiddenStacks: [] },
            })
          }
        />
      </SettingRow>
      <SettingRow>
        <SettingLabel>{t("Sub-group")}</SettingLabel>
        <CompactSelect
          ariaLabel={t("Sub-group")}
          value={view.overrides.subGroupFieldId || NO_SUB_GROUP}
          options={[
            { value: NO_SUB_GROUP, label: t("No sub-group") },
            ...subGroupFields.map((f) => ({
              value: f.id,
              label: f.name,
              icon: <FieldKindIcon field={f} size={16} />,
            })),
          ]}
          onChange={(value) =>
            onUpdate({
              overrides: {
                subGroupFieldId: value === NO_SUB_GROUP ? "" : value,
              },
            })
          }
        />
      </SettingRow>
      <SettingRow as="label">
        <SettingLabel>{t("Hide empty groups")}</SettingLabel>
        <Switch
          checked={!!view.options.isEmptyStackHidden}
          onChange={(isEmptyStackHidden) =>
            onUpdate({ options: { isEmptyStackHidden } })
          }
        />
      </SettingRow>
      {stackField && (
        <>
          <PanelDivider />
          <PanelHeader>
            <Grow>{t("Visible groups")}</Grow>
            {!!visibleKeys.length && (
              <TextButton
                type="button"
                onClick={() =>
                  onUpdate({
                    overrides: {
                      hiddenStacks: [...hiddenKeys, ...visibleKeys],
                    },
                  })
                }
              >
                {t("Hide all")}
              </TextButton>
            )}
          </PanelHeader>
          <SortableRows
            ids={visibleKeys.map(stackId)}
            onReorder={(ids) =>
              onUpdate({
                overrides: {
                  stackOrder: [...ids.map(stackName), ...hiddenKeys],
                },
              })
            }
            renderRow={(id, handle) =>
              renderColumn(stackName(id), handle, false)
            }
          />
          {!!hiddenKeys.length && (
            <>
              <PanelHeader>
                <Grow>{t("Hidden groups")}</Grow>
                <TextButton
                  type="button"
                  onClick={() => onUpdate({ overrides: { hiddenStacks: [] } })}
                >
                  {t("Show all")}
                </TextButton>
              </PanelHeader>
              {hiddenKeys.map((key) => (
                <React.Fragment key={stackId(key)}>
                  {renderColumn(key, null, true)}
                </React.Fragment>
              ))}
            </>
          )}
        </>
      )}
    </Wrapper>
  );
});

function StackLabel({
  field,
  name,
  database,
}: {
  field: DatabaseField;
  name: string;
  database: Database;
}) {
  const { Renderer } = getCell(field.type);
  return (
    <Renderer field={field} value={name} database={database} variant="card" />
  );
}

/**
 * Whether a view can be grouped by a field.
 *
 * @param field the field.
 * @returns false for attachments, buttons and long text.
 */
function isGroupableField(field: DatabaseField): boolean {
  return (
    field.type !== DatabaseFieldType.Attachment &&
    field.type !== DatabaseFieldType.Button &&
    field.type !== DatabaseFieldType.LongText
  );
}

// Radix select values and sortable ids cannot be empty strings.
const NO_SUB_GROUP = "\u0000none";
const EMPTY_STACK_ID = "\u0000empty";

function stackId(name: string) {
  return name === EMPTY_STACK ? EMPTY_STACK_ID : name;
}

function stackName(id: string) {
  return id === EMPTY_STACK_ID ? EMPTY_STACK : id;
}

const Wrapper = styled.div`
  padding: 0 6px;
`;

const LevelRow = styled.div`
  display: grid;
  grid-template-columns: 72px minmax(120px, 1fr) 120px 28px;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
`;

const LevelLabel = styled.span`
  color: ${s("textSecondary")};
  font-size: 14px;
  ${ellipsis()}
`;

const SettingRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
  padding: 0 8px;
  font-size: 14px;
`;

const SettingLabel = styled.span`
  color: ${s("text")};
`;

const Footer = styled.div`
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid ${s("divider")};
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

const StackRow = styled.div<{ $hidden: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 2px;
  opacity: ${(props) => (props.$hidden ? 0.55 : 1)};
`;

const HandleSpacer = styled.span`
  width: 18px;
  flex-shrink: 0;
`;

const StackName = styled.div`
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: ${s("textSecondary")};
`;

const IconButton = styled(NudeButton)`
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
