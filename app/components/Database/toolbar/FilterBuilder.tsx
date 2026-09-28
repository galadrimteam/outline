import type { TFunction } from "i18next";
import { observer } from "mobx-react";
import { PlusIcon, TrashIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { FilterPath } from "@shared/databases/filters";
import {
  appendFilterNode,
  canNestFilterGroup,
  changeFilterItemField,
  changeFilterItemOperator,
  createFilterItem,
  emptyFilter,
  filterConjunctionLabel,
  filterOperatorLabel,
  getValidFilterOperators,
  isFilterGroup,
  isFilterableField,
  normalizeFilter,
  removeFilterNode,
  setFilterConjunction,
  updateFilterNode,
} from "@shared/databases/filters";
import type {
  DatabaseField,
  DatabaseFilter,
  DatabaseFilterConjunction,
  DatabaseFilterItem,
  DatabaseRecord,
} from "@shared/databases/types";
import { borderRadius, s } from "@shared/styles";
import NudeButton from "~/components/NudeButton";
import Tooltip from "~/components/Tooltip";
import type Database from "~/models/Database";
import { orderedFields } from "./columns";
import {
  CompactSelect,
  FieldPicker,
  PanelAction,
  PanelDivider,
  PanelHeader,
} from "./components";
import { FilterValueEditor } from "./FilterValueEditor";
import { FieldKindIcon } from "../fields/FieldKindIcon";

interface Props {
  /** The database whose rows are filtered. */
  database: Database;
  /** The filter being edited; null when there is none. */
  filter: DatabaseFilter | null;
  /** Called with the edited filter; null once the last rule is removed. */
  onChange: (filter: DatabaseFilter | null) => void;
  /** Loaded rows, to offer the people and linked rows they hold as values. */
  records: DatabaseRecord[];
  /** The view's saved filter, shown locked above the rules of someone who may not save it. */
  lockedFilter?: DatabaseFilter | null;
}

/**
 * Notion-like filter editor: a list of rules on the view's rows, each « field ·
 * operator · value », joined by « And » or « Or »; groups of rules nest up to
 * three levels for advanced filters. With no rule yet it opens on the field
 * list, like Notion's « Filter by… ».
 *
 * @param props the filter and the change callback.
 * @returns the editor.
 */
export const FilterBuilder = observer(function FilterBuilder({
  database,
  filter,
  onChange,
  records,
  lockedFilter,
}: Props) {
  const { t } = useTranslation();
  const timeZone = React.useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  );
  const fields = React.useMemo(
    () =>
      orderedFields(database.fields ?? [], { columnMeta: {} }).filter(
        isFilterableField
      ),
    [database.fields]
  );
  const root = filter ?? emptyFilter();

  const handleChange = React.useCallback(
    (next: DatabaseFilter) => onChange(normalizeFilter(next) ? next : null),
    [onChange]
  );

  const handlePickFirst = React.useCallback(
    (field: DatabaseField) => {
      const item = createFilterItem(field, timeZone);
      if (item) {
        onChange({ conjunction: "and", filterSet: [item] });
      }
    },
    [onChange, timeZone]
  );

  const lockedSummary = lockedFilter
    ? describeFilter(lockedFilter, database, t)
    : "";

  return (
    <Wrapper>
      {lockedSummary && (
        <>
          <PanelHeader>{t("This view already shows rows where")}</PanelHeader>
          <Locked>{lockedSummary}</Locked>
          <PanelDivider />
        </>
      )}
      {root.filterSet.length ? (
        <>
          <GroupEditor
            database={database}
            fields={fields}
            group={root}
            path={[]}
            root={root}
            records={records}
            timeZone={timeZone}
            onChange={handleChange}
          />
          <Footer>
            <PanelAction type="button" onClick={() => onChange(null)} $danger>
              <TrashIcon size={18} />
              {t("Delete filter")}
            </PanelAction>
          </Footer>
        </>
      ) : (
        <FieldPicker
          fields={fields}
          onSelect={handlePickFirst}
          placeholder={t("Filter by…")}
        />
      )}
    </Wrapper>
  );
});

interface GroupEditorProps {
  database: Database;
  fields: DatabaseField[];
  group: DatabaseFilter;
  path: FilterPath;
  root: DatabaseFilter;
  records: DatabaseRecord[];
  timeZone: string;
  onChange: (filter: DatabaseFilter) => void;
}

const GroupEditor = observer(function GroupEditor({
  database,
  fields,
  group,
  path,
  root,
  records,
  timeZone,
  onChange,
}: GroupEditorProps) {
  const { t } = useTranslation();

  const handleAddRule = React.useCallback(() => {
    const field = fields[0];
    const item = field ? createFilterItem(field, timeZone) : undefined;
    if (item) {
      onChange(appendFilterNode(root, path, item));
    }
  }, [fields, timeZone, onChange, root, path]);

  const handleAddGroup = React.useCallback(() => {
    const field = fields[0];
    const item = field ? createFilterItem(field, timeZone) : undefined;
    if (item) {
      onChange(
        appendFilterNode(root, path, { conjunction: "and", filterSet: [item] })
      );
    }
  }, [fields, timeZone, onChange, root, path]);

  const handleConjunction = React.useCallback(
    (conjunction: DatabaseFilterConjunction) =>
      onChange(setFilterConjunction(root, path, conjunction)),
    [onChange, root, path]
  );

  const conjunctionOptions = [
    { value: "and" as const, label: filterConjunctionLabel("and", t) },
    { value: "or" as const, label: filterConjunctionLabel("or", t) },
  ];

  return (
    <Rows>
      {group.filterSet.map((node, index) => {
        const nodePath = [...path, index];
        const conjunction =
          index === 0 ? (
            <Where>{t("Where")}</Where>
          ) : index === 1 ? (
            <CompactSelect
              ariaLabel={t("Conjunction")}
              value={group.conjunction}
              options={conjunctionOptions}
              onChange={handleConjunction}
            />
          ) : (
            <Where>{filterConjunctionLabel(group.conjunction, t)}</Where>
          );

        return (
          <Row key={index}>
            <ConjunctionCell>{conjunction}</ConjunctionCell>
            {isFilterGroup(node) ? (
              <Nested>
                <GroupEditor
                  database={database}
                  fields={fields}
                  group={node}
                  path={nodePath}
                  root={root}
                  records={records}
                  timeZone={timeZone}
                  onChange={onChange}
                />
                <RemoveButton
                  label={t("Remove group")}
                  onClick={() => onChange(removeFilterNode(root, nodePath))}
                />
              </Nested>
            ) : (
              <RuleEditor
                database={database}
                fields={fields}
                item={node}
                records={records}
                timeZone={timeZone}
                onChange={(item) =>
                  onChange(updateFilterNode(root, nodePath, item))
                }
                onRemove={() => onChange(removeFilterNode(root, nodePath))}
              />
            )}
          </Row>
        );
      })}
      <Actions>
        <PanelAction type="button" onClick={handleAddRule}>
          <PlusIcon size={18} />
          {t("Add filter rule")}
        </PanelAction>
        {canNestFilterGroup(path) && (
          <PanelAction type="button" onClick={handleAddGroup}>
            <PlusIcon size={18} />
            {t("Add filter group")}
          </PanelAction>
        )}
      </Actions>
    </Rows>
  );
});

interface RuleEditorProps {
  database: Database;
  fields: DatabaseField[];
  item: DatabaseFilterItem;
  records: DatabaseRecord[];
  timeZone: string;
  onChange: (item: DatabaseFilterItem) => void;
  onRemove: () => void;
}

const RuleEditor = observer(function RuleEditor({
  database,
  fields,
  item,
  records,
  timeZone,
  onChange,
  onRemove,
}: RuleEditorProps) {
  const { t } = useTranslation();
  const field = database.fieldById(item.fieldId);

  const fieldOptions = fields.map((f) => ({
    value: f.id,
    label: f.name,
    icon: <FieldKindIcon field={f} size={16} />,
  }));
  const operatorOptions = field
    ? getValidFilterOperators(field).map((operator) => ({
        value: operator,
        label: filterOperatorLabel(operator, t, field.cellValueType),
      }))
    : [];

  return (
    <Rule>
      <CompactSelect
        ariaLabel={t("Property")}
        value={field ? item.fieldId : undefined}
        placeholder={t("Deleted property")}
        options={fieldOptions}
        onChange={(fieldId) => {
          const next = database.fieldById(fieldId);
          if (next) {
            onChange(changeFilterItemField(item, next, timeZone));
          }
        }}
      />
      <CompactSelect
        ariaLabel={t("Condition")}
        value={field ? item.operator : undefined}
        options={operatorOptions}
        disabled={!field}
        onChange={(operator) => {
          if (field) {
            onChange(changeFilterItemOperator(item, field, operator, timeZone));
          }
        }}
      />
      <ValueCell>
        {field && (
          <FilterValueEditor
            database={database}
            field={field}
            item={item}
            records={records}
            onChange={(value) => onChange({ ...item, value })}
          />
        )}
      </ValueCell>
      <RemoveButton label={t("Remove rule")} onClick={onRemove} />
    </Rule>
  );
});

function RemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip content={label}>
      <Remove type="button" aria-label={label} onClick={onClick} size={28}>
        <TrashIcon size={18} />
      </Remove>
    </Tooltip>
  );
}

/**
 * Writes a filter as one readable line, for the locked view filter shown to
 * readers: « Status is not Done and (Due is before Today) ».
 *
 * @param filter the filter.
 * @param database the database, to name fields.
 * @param t the translation function.
 * @returns the description, empty for an empty filter.
 */
function describeFilter(
  filter: DatabaseFilter,
  database: Database,
  t: TFunction
): string {
  const parts = filter.filterSet.map((node) => {
    if (isFilterGroup(node)) {
      const inner = describeFilter(node, database, t);
      return inner ? `(${inner})` : "";
    }
    const field = database.fieldById(node.fieldId);
    const operator = filterOperatorLabel(
      node.operator,
      t,
      field?.cellValueType
    ).toLocaleLowerCase();
    const value = describeValue(node.value, t);
    return [field?.name ?? t("Deleted property"), operator, value]
      .filter(Boolean)
      .join(" ");
  });
  return parts
    .filter(Boolean)
    .join(
      ` ${filterConjunctionLabel(filter.conjunction, t).toLocaleLowerCase()} `
    );
}

function describeValue(
  value: DatabaseFilterItem["value"],
  t: TFunction
): string {
  if (value === null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object") {
    return value.numberOfDays !== undefined
      ? `${value.numberOfDays} ${t("days")}`
      : (value.exactDate?.slice(0, 10) ?? value.mode);
  }
  if (typeof value === "boolean") {
    return value ? t("Checked") : t("Unchecked");
  }
  return String(value);
}

const Wrapper = styled.div`
  padding: 0 6px;
`;

const Rows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Row = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 6px;

  @media (max-width: 600px) {
    flex-direction: column;
    align-items: stretch;

    > :first-child {
      flex: none;
    }
  }
`;

const ConjunctionCell = styled.div`
  flex: 0 0 72px;
  display: flex;
  align-items: center;
  min-height: 28px;
`;

const Where = styled.span`
  padding-inline-start: 8px;
  color: ${s("textSecondary")};
  font-size: 14px;
`;

const ValueCell = styled.div`
  min-width: 0;
`;

const Rule = styled.div`
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns:
    minmax(96px, 150px) minmax(88px, 150px) minmax(120px, 1fr)
    28px;
  align-items: start;
  gap: 6px;

  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 28px;

    ${ValueCell} {
      grid-column: 1 / 3;
      grid-row: 2;
    }
  }
`;

const Nested = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px;
  border: 1px solid ${s("divider")};
  ${borderRadius(8)}
  background: ${s("backgroundSecondary")};

  > :first-child {
    flex: 1;
    min-width: 0;
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 2px;

  ${PanelAction} {
    width: auto;
  }
`;

const Footer = styled.div`
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid ${s("divider")};
`;

const Locked = styled.p`
  margin: 0 8px 4px;
  color: ${s("textSecondary")};
  font-size: 14px;
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
