import type { TFunction } from "i18next";
import { observer } from "mobx-react";
import { BackIcon, NextIcon, PadlockIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled, { css } from "styled-components";
import type {
  DatabaseCardSize,
  DatabaseField,
  DatabaseOpenPagesIn,
  DatabaseSubItemsMode,
  DatabaseView,
  DatabaseViewOptions,
} from "@shared/databases/types";
import { DatabaseFieldType, DatabaseLayout } from "@shared/databases/types";
import { borderRadius, s } from "@shared/styles";
import Switch from "~/components/Switch";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { orderedFields, wrapResetPatch } from "./columns";
import {
  CompactSelect,
  PanelDivider,
  PanelHeader,
  PanelRow,
  RowLabel,
  RowValue,
} from "./components";
import { useDatabaseBlock } from "../DatabaseBlockContext";
import { LayoutIcon } from "../LayoutIcon";
import { FieldKindIcon } from "../fields/FieldKindIcon";
import { showsTimelineTable } from "../views/TimelineView/timelineModel";
import type { DatabaseViewPatch } from "./useViewUpdate";

interface Props {
  /** The database of the view. */
  database: Database;
  /** The view being configured. */
  view: DatabaseView;
  /** Saves changes to the view for everyone. */
  onUpdate: (patch: DatabaseViewPatch) => void;
}

/** The layouts offered by the layout switch, in Notion's order. */
export const SWITCHABLE_LAYOUTS: DatabaseLayout[] = [
  DatabaseLayout.Table,
  DatabaseLayout.Board,
  DatabaseLayout.Timeline,
  DatabaseLayout.Calendar,
  DatabaseLayout.List,
  DatabaseLayout.Gallery,
  DatabaseLayout.Form,
];

/**
 * Notion-like « View options »: the layout and its options (card preview and
 * size, property names, row height and wrapping, frozen column, the date
 * properties of calendars and timelines), where pages open, and the lock.
 * A locked view keeps its settings until someone unlocks it.
 *
 * @param props the view and the save callback.
 * @returns the panel.
 */
export const ViewSettings = observer(function ViewSettings({
  database,
  view,
  onUpdate,
}: Props) {
  const { t } = useTranslation();
  const [page, setPage] = React.useState<"main" | "layout">("main");
  const locked = view.isLocked;

  if (page === "layout") {
    return (
      <LayoutPage
        database={database}
        view={view}
        onUpdate={onUpdate}
        onBack={() => setPage("main")}
      />
    );
  }

  const openPagesIn = view.overrides.openPagesIn ?? "sidePeek";

  return (
    <Wrapper>
      <PanelHeader>{t("View options")}</PanelHeader>
      <PanelRow
        type="button"
        disabled={locked}
        onClick={() => setPage("layout")}
      >
        <LayoutIcon layout={view.layout} size={18} />
        <RowLabel>{t("Layout")}</RowLabel>
        <RowValue>{layoutLabel(view.layout, t)}</RowValue>
        <NextIcon size={18} />
      </PanelRow>
      <LayoutOptions
        database={database}
        view={view}
        onUpdate={onUpdate}
        disabled={locked}
      />
      <Setting label={t("Open pages in")}>
        <CompactSelect<DatabaseOpenPagesIn>
          ariaLabel={t("Open pages in")}
          value={openPagesIn}
          disabled={locked}
          options={[
            { value: "sidePeek", label: t("Side peek") },
            { value: "centerPeek", label: t("Center peek") },
            { value: "fullPage", label: t("Full page") },
          ]}
          onChange={(value) => onUpdate({ overrides: { openPagesIn: value } })}
        />
      </Setting>
      <PanelDivider />
      <Setting
        label={
          <LockLabel>
            <PadlockIcon size={18} />
            {t("Lock view")}
          </LockLabel>
        }
        hint={
          locked
            ? t("Filters and sorts can still be changed for yourself.")
            : undefined
        }
        as="label"
      >
        <Switch
          checked={locked}
          onChange={(isLocked) => onUpdate({ isLocked })}
        />
      </Setting>
    </Wrapper>
  );
});

interface LayoutOptionsProps extends Props {
  disabled: boolean;
}

const LayoutOptions = observer(function LayoutOptions({
  database,
  view,
  onUpdate,
  disabled,
}: LayoutOptionsProps) {
  const { t } = useTranslation();
  const fields = orderedFields(database.fields ?? [], view);
  const dateFields = fields.filter((f) => f.cellValueType === "dateTime");
  const setOptions = (options: Partial<DatabaseViewOptions>) =>
    onUpdate({ options });

  switch (view.layout) {
    case DatabaseLayout.Board:
    case DatabaseLayout.Gallery: {
      const attachments = fields.filter(
        (f) => f.type === DatabaseFieldType.Attachment
      );
      return (
        <>
          <Setting label={t("Card preview")}>
            <CompactSelect
              ariaLabel={t("Card preview")}
              value={view.options.coverFieldId || NONE}
              disabled={disabled}
              options={[
                { value: NONE, label: t("No preview") },
                ...fieldOptions(attachments),
              ]}
              onChange={(value) =>
                setOptions({ coverFieldId: value === NONE ? "" : value })
              }
            />
          </Setting>
          {!!view.options.coverFieldId && (
            <Setting label={t("Fit image")} as="label">
              <Switch
                checked={!!view.options.isCoverFit}
                disabled={disabled}
                onChange={(isCoverFit) => setOptions({ isCoverFit })}
              />
            </Setting>
          )}
          <Setting label={t("Card size")}>
            <CompactSelect<DatabaseCardSize>
              ariaLabel={t("Card size")}
              value={view.overrides.cardSize ?? "medium"}
              disabled={disabled}
              options={[
                { value: "small", label: t("Small") },
                { value: "medium", label: t("Medium") },
                { value: "large", label: t("Large") },
              ]}
              onChange={(cardSize) => onUpdate({ overrides: { cardSize } })}
            />
          </Setting>
          <Setting label={t("Show property names")} as="label">
            <Switch
              checked={view.options.isFieldNameHidden === false}
              disabled={disabled}
              onChange={(shown) => setOptions({ isFieldNameHidden: !shown })}
            />
          </Setting>
        </>
      );
    }
    case DatabaseLayout.Table: {
      const rowHeight = view.options.rowHeight ?? "short";
      return (
        <>
          <Setting label={t("Wrap all content")} as="label">
            <Switch
              checked={rowHeight === "autoFit"}
              disabled={disabled}
              onChange={(wrap) =>
                onUpdate({
                  options: { rowHeight: wrap ? "autoFit" : "short" },
                  columnMeta: wrapResetPatch(view),
                })
              }
            />
          </Setting>
          {rowHeight !== "autoFit" && (
            <Setting label={t("Row height")}>
              <CompactSelect
                ariaLabel={t("Row height")}
                value={rowHeight}
                disabled={disabled}
                options={[
                  { value: "short", label: t("Short") },
                  { value: "medium", label: t("Medium") },
                  { value: "tall", label: t("Tall") },
                  { value: "extraTall", label: t("Extra tall") },
                ]}
                onChange={(value) => setOptions({ rowHeight: value })}
              />
            </Setting>
          )}
          <SubItemSettings
            database={database}
            view={view}
            onUpdate={onUpdate}
            disabled={disabled}
          />
          <Setting label={t("Freeze columns up to")}>
            <CompactSelect
              ariaLabel={t("Freeze columns up to")}
              value={view.options.frozenFieldId || NONE}
              disabled={disabled}
              options={[
                { value: NONE, label: t("No frozen column") },
                ...fieldOptions(fields),
              ]}
              onChange={(value) =>
                setOptions({ frozenFieldId: value === NONE ? "" : value })
              }
            />
          </Setting>
        </>
      );
    }
    case DatabaseLayout.Calendar:
      return (
        <>
          <Setting label={t("Show calendar by")}>
            <CompactSelect
              ariaLabel={t("Show calendar by")}
              value={view.options.startDateFieldId}
              placeholder={t("Select a property")}
              disabled={disabled}
              options={fieldOptions(dateFields)}
              onChange={(startDateFieldId) => setOptions({ startDateFieldId })}
            />
          </Setting>
          <Setting label={t("End date")}>
            <CompactSelect
              ariaLabel={t("End date")}
              value={
                view.options.endDateFieldId &&
                view.options.endDateFieldId !== view.options.startDateFieldId
                  ? view.options.endDateFieldId
                  : NONE
              }
              disabled={disabled}
              options={[
                { value: NONE, label: t("No end date") },
                ...fieldOptions(
                  dateFields.filter(
                    (f) => f.id !== view.options.startDateFieldId
                  )
                ),
              ]}
              onChange={(value) =>
                setOptions({ endDateFieldId: value === NONE ? "" : value })
              }
            />
          </Setting>
        </>
      );
    case DatabaseLayout.Timeline: {
      const timeline = view.overrides.timeline ?? {};
      const selfLinks = fields.filter(
        (f) =>
          f.type === DatabaseFieldType.Link &&
          !!f.options.symmetricFieldId &&
          !!database.fieldById(f.options.symmetricFieldId)
      );
      const setTimeline = (patch: Partial<typeof timeline>) =>
        onUpdate({ overrides: { timeline: { ...timeline, ...patch } } });
      return (
        <>
          <Setting label={t("Show timeline by")}>
            <CompactSelect
              ariaLabel={t("Show timeline by")}
              value={timeline.startFieldId || view.options.startDateFieldId}
              placeholder={t("Select a property")}
              disabled={disabled}
              options={fieldOptions(dateFields)}
              onChange={(startFieldId) => setTimeline({ startFieldId })}
            />
          </Setting>
          <Setting label={t("End date")}>
            <CompactSelect
              ariaLabel={t("End date")}
              value={timeline.endFieldId || NONE}
              disabled={disabled}
              options={[
                { value: NONE, label: t("No end date") },
                ...fieldOptions(
                  dateFields.filter((f) => f.id !== timeline.startFieldId)
                ),
              ]}
              onChange={(value) =>
                setTimeline({ endFieldId: value === NONE ? "" : value })
              }
            />
          </Setting>
          <Setting label={t("Dependencies")}>
            <CompactSelect
              ariaLabel={t("Dependencies")}
              value={timeline.dependencyFieldId || NONE}
              disabled={disabled}
              options={[
                { value: NONE, label: t("No dependencies") },
                ...fieldOptions(selfLinks),
              ]}
              onChange={(value) =>
                setTimeline({ dependencyFieldId: value === NONE ? "" : value })
              }
            />
          </Setting>
          <Setting label={t("Show table")} as="label">
            <Switch
              checked={showsTimelineTable(timeline)}
              disabled={disabled}
              onChange={(showTable) => setTimeline({ showTable })}
            />
          </Setting>
        </>
      );
    }
    default:
      return null;
  }
});

interface LayoutPageProps extends Props {
  onBack: () => void;
}

const LayoutPage = observer(function LayoutPage({
  database,
  view,
  onUpdate,
  onBack,
}: LayoutPageProps) {
  const { t } = useTranslation();
  const { databases } = useStores();
  const block = useDatabaseBlock();

  const handleSelect = React.useCallback(
    async (layout: DatabaseLayout) => {
      if (layout === view.layout) {
        return;
      }
      const inPlace = inPlaceLayoutOverride(view, layout);
      if (inPlace !== undefined) {
        onUpdate({ overrides: { layout: inPlace } });
        return;
      }
      try {
        const created = await databases.createView(database.id, {
          name: view.name,
          layout,
        });
        // A form adds rows, it shows none: there is nothing to filter or sort.
        const copied =
          layout === DatabaseLayout.Form
            ? created
            : await databases.updateView(database.id, created.id, {
                filter: view.filter,
                sort: view.sort,
              });
        block?.onViewCreated(copied ?? created);
        toast.success(
          t("A {{ layout }} view named “{{ name }}” was added to the tabs", {
            layout: layoutLabel(layout, t).toLocaleLowerCase(),
            name: view.name,
          })
        );
      } catch (err) {
        toast.error(
          err instanceof Error && err.message
            ? err.message
            : t("The view could not be created")
        );
      }
    },
    [databases, database.id, view, onUpdate, block, t]
  );

  return (
    <Wrapper>
      <PanelHeader>
        <BackButton type="button" aria-label={t("Back")} onClick={onBack}>
          <BackIcon size={18} />
        </BackButton>
        {t("Layout")}
      </PanelHeader>
      <Tiles role="radiogroup" aria-label={t("Layout")}>
        {SWITCHABLE_LAYOUTS.map((layout) => {
          const isCurrent = layout === view.layout;
          const addsView =
            !isCurrent && inPlaceLayoutOverride(view, layout) === undefined;
          return (
            <Tile
              key={layout}
              type="button"
              role="radio"
              aria-checked={isCurrent}
              $active={isCurrent}
              title={
                addsView && layout !== DatabaseLayout.Form
                  ? t("Adds a new view with the same filters and sorts")
                  : undefined
              }
              onClick={() => handleSelect(layout)}
            >
              <LayoutIcon layout={layout} size={24} />
              {layoutLabel(layout, t)}
              {addsView && <Badge>{t("New view")}</Badge>}
            </Tile>
          );
        })}
      </Tiles>
      <PanelDivider />
      <LayoutOptions
        database={database}
        view={view}
        onUpdate={onUpdate}
        disabled={view.isLocked}
      />
    </Wrapper>
  );
});

/**
 * Returns the `overrides.layout` that shows a grid view with another layout in
 * place: list, timeline, or null to draw it as the table it is again. Other
 * layouts need another engine view type, hence a new view.
 *
 * @param view the view.
 * @param layout the wanted layout.
 * @returns the override to save, null to clear it, or undefined for a new view.
 */
export function inPlaceLayoutOverride(
  view: Pick<DatabaseView, "type">,
  layout: DatabaseLayout
): DatabaseLayout.List | DatabaseLayout.Timeline | null | undefined {
  if (view.type !== "grid") {
    return undefined;
  }
  switch (layout) {
    case DatabaseLayout.List:
    case DatabaseLayout.Timeline:
      return layout;
    case DatabaseLayout.Table:
      return null;
    default:
      return undefined;
  }
}

/**
 * Returns the name of a layout, in the reader's language.
 *
 * @param layout the layout.
 * @param t the translation function.
 * @returns the name.
 */
export function layoutLabel(layout: DatabaseLayout, t: TFunction): string {
  switch (layout) {
    case DatabaseLayout.Table:
      return t("Table");
    case DatabaseLayout.Board:
      return t("Board");
    case DatabaseLayout.Calendar:
      return t("Calendar");
    case DatabaseLayout.Gallery:
      return t("Gallery");
    case DatabaseLayout.List:
      return t("List");
    case DatabaseLayout.Timeline:
      return t("Timeline");
    case DatabaseLayout.Form:
      return t("Form");
  }
}

// Radix select values cannot be empty strings; "" is saved to mean "none".
/**
 * Notion's « Sub-items » of a table: the relation of the database to itself
 * that lists a row's sub-items (a setting of the database), and how this view
 * shows them.
 *
 * @param props the view, the save callback and whether it is locked.
 * @returns the settings, nothing when the database has no such relation.
 */
const SubItemSettings = observer(function SubItemSettings({
  database,
  view,
  onUpdate,
  disabled,
}: LayoutOptionsProps) {
  const { t } = useTranslation();
  const { databases } = useStores();
  const relations = (database.fields ?? []).filter(
    (field) =>
      field.type === DatabaseFieldType.Link &&
      field.options.foreignDatabaseId === database.id &&
      !!field.options.symmetricFieldId
  );
  if (!relations.length) {
    return null;
  }
  const subItemFieldId = database.settings?.subItemFieldId;
  const handleRelation = (value: string) =>
    void databases
      .update(database.id, {
        settings: { subItemFieldId: value === NONE ? null : value },
      })
      .catch((err: unknown) =>
        toast.error(err instanceof Error ? err.message : String(err))
      );

  return (
    <>
      <Setting label={t("Sub-items")}>
        <CompactSelect
          ariaLabel={t("Sub-items")}
          value={subItemFieldId || NONE}
          disabled={disabled}
          options={[
            { value: NONE, label: t("None") },
            ...fieldOptions(relations),
          ]}
          onChange={handleRelation}
        />
      </Setting>
      {subItemFieldId && (
        <Setting label={t("Show sub-items")}>
          <CompactSelect<DatabaseSubItemsMode>
            ariaLabel={t("Show sub-items")}
            value={view.overrides.subItems ?? "nested"}
            disabled={disabled}
            options={[
              { value: "nested", label: t("Nested") },
              { value: "flattened", label: t("Flattened") },
              { value: "off", label: t("As rows") },
            ]}
            onChange={(subItems) => onUpdate({ overrides: { subItems } })}
          />
        </Setting>
      )}
    </>
  );
});

const NONE = "\u0000none";

function fieldOptions(fields: DatabaseField[]) {
  return fields.map((field) => ({
    value: field.id,
    label: field.name,
    icon: <FieldKindIcon field={field} size={16} />,
  }));
}

function Setting({
  label,
  hint,
  children,
  as,
}: {
  label: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
  as?: "label";
}) {
  return (
    <SettingRow as={as}>
      <SettingText>
        <span>{label}</span>
        {hint && <SettingHint>{hint}</SettingHint>}
      </SettingText>
      <SettingControl>{children}</SettingControl>
    </SettingRow>
  );
}

const Wrapper = styled.div`
  padding: 0 6px;
`;

const SettingRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
  padding: 2px 8px;
  color: ${s("text")};
  font-size: 14px;
`;

const SettingText = styled.span`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const SettingHint = styled.span`
  color: ${s("textTertiary")};
  font-size: 12px;
`;

const SettingControl = styled.span`
  display: flex;
  justify-content: flex-end;
  max-width: 55%;
  min-width: 0;
`;

const LockLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;

  svg {
    color: ${s("textTertiary")};
  }
`;

const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  ${borderRadius(4)}
  background: none;
  color: ${s("textSecondary")};
  cursor: var(--pointer);

  &:hover,
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    outline: none;
  }
`;

const Tiles = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 0 2px;
`;

const Tile = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px 8px;
  border: 1px solid ${s("divider")};
  ${borderRadius(8)}
  background: none;
  color: ${s("textSecondary")};
  font-size: 13px;
  cursor: var(--pointer);

  &:hover,
  &:focus-visible {
    background: ${s("listItemHoverBackground")};
    outline: none;
  }

  ${(props) =>
    props.$active &&
    css`
      border-color: ${props.theme.accent};
      box-shadow: 0 0 0 1px ${props.theme.accent};
      color: ${props.theme.accent};
    `}
`;

const Badge = styled.span`
  color: ${s("textTertiary")};
  font-size: 11px;
`;
