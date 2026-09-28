import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { observer } from "mobx-react";
import { CollapsedIcon, ExpandedIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { DatabaseField, DatabaseView } from "@shared/databases/types";
import { s, hover } from "@shared/styles";
import usePersistedState from "~/hooks/usePersistedState";
import type Database from "~/models/Database";
import type { RecordQuery } from "~/stores/DatabaseRecordsStore";
import type { BoardColumn, BoardLane } from "../../boardModel";
import { containerKey } from "../../boardModel";
import { getCell } from "../../cells/registry";
import {
  LaneCell,
  LaneColumnHeader,
  QueryFooter,
  columnDndId,
  columnWidths,
} from "./BoardColumn";

interface Props {
  database: Database;
  view: DatabaseView;
  field: DatabaseField;
  /** The property the lanes are made of. */
  subField: DatabaseField;
  lanes: BoardLane[];
  columns: BoardColumn[];
  queries: Map<string, RecordQuery>;
  /** The draggable card ids of a container, following an ongoing drag. */
  idsFor: (container: string) => string[];
  cardFields: DatabaseField[];
  readOnly: boolean;
  onOpen: (recordId: string) => void;
  onHide: (key: string) => void;
  onCreate: (
    container: string,
    title: string,
    at: "top" | "bottom"
  ) => Promise<void>;
}

/**
 * A board with sub-groups, like Notion's: the column headers once at the top,
 * then one foldable lane per value of a second property, each with its own
 * row of columns. Cards can be dragged across columns and lanes.
 */
export const BoardLanes = observer(function BoardLanes({
  database,
  view,
  field,
  subField,
  lanes,
  columns,
  queries,
  idsFor,
  cardFields,
  readOnly,
  onOpen,
  onHide,
  onCreate,
}: Props) {
  const [folded, setFolded] = usePersistedState<string[]>(
    `database:${view.id}:folded-lanes`,
    []
  );
  const width = columnWidths[view.overrides.cardSize ?? "medium"];

  const handleToggle = React.useCallback(
    (key: string) =>
      setFolded((current) =>
        current.includes(key)
          ? current.filter((item) => item !== key)
          : [...current, key]
      ),
    [setFolded]
  );

  return (
    <Grid>
      <Row>
        <SortableContext
          items={columns.map((column) => columnDndId(column.key))}
          strategy={horizontalListSortingStrategy}
        >
          {columns.map((column) => {
            const query = queries.get(column.key);
            return query ? (
              <LaneColumnHeader
                key={column.key}
                view={view}
                field={field}
                column={column}
                query={query}
                readOnly={readOnly}
                onHide={onHide}
              />
            ) : null;
          })}
        </SortableContext>
      </Row>
      {lanes.map((lane) => {
        const isFolded = folded.includes(lane.key);
        return (
          <section key={lane.key} aria-label={laneLabel(lane, subField)}>
            <LaneTitle
              database={database}
              subField={subField}
              lane={lane}
              isFolded={isFolded}
              onToggle={handleToggle}
            />
            {!isFolded && (
              <Row>
                {columns.map((column) => {
                  const container = containerKey(lane.key, column.key);
                  return (
                    <LaneCell
                      key={column.key}
                      database={database}
                      view={view}
                      column={column}
                      container={container}
                      cardIds={idsFor(container)}
                      copyIds={lane.copies[column.key]}
                      cardFields={cardFields}
                      readOnly={readOnly}
                      onOpen={onOpen}
                      onCreate={onCreate}
                    />
                  );
                })}
              </Row>
            )}
          </section>
        );
      })}
      <Row>
        {columns.map((column) => {
          const query = queries.get(column.key);
          return (
            <Footer key={column.key} style={{ width }}>
              {query && <QueryFooter query={query} />}
            </Footer>
          );
        })}
      </Row>
    </Grid>
  );
});

const LaneTitle = observer(function LaneTitle({
  database,
  subField,
  lane,
  isFolded,
  onToggle,
}: {
  database: Database;
  subField: DatabaseField;
  lane: BoardLane;
  isFolded: boolean;
  onToggle: (key: string) => void;
}) {
  const { t } = useTranslation();
  const { Renderer } = getCell(subField.type);
  const handleClick = React.useCallback(
    () => onToggle(lane.key),
    [onToggle, lane.key]
  );

  return (
    <Title>
      <Toggle
        type="button"
        aria-expanded={!isFolded}
        aria-label={isFolded ? t("Expand") : t("Collapse")}
        onClick={handleClick}
      >
        {isFolded ? <CollapsedIcon size={18} /> : <ExpandedIcon size={18} />}
      </Toggle>
      {lane.key === "" ? (
        <Empty>{t("No {{ name }}", { name: subField.name })}</Empty>
      ) : (
        <Renderer
          field={subField}
          value={lane.value}
          database={database}
          variant="card"
        />
      )}
      <Count>{lane.count}</Count>
    </Title>
  );
});

function laneLabel(lane: BoardLane, field: DatabaseField): string {
  return lane.key === "" ? field.name : `${field.name}: ${lane.key}`;
}

const Grid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Row = styled.div`
  display: flex;
  align-items: stretch;
  gap: 12px;
`;

const Title = styled.div`
  position: sticky;
  left: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  width: max-content;
  min-height: 32px;
  padding: 4px 0;
  font-size: 14px;
  font-weight: 500;
`;

const Toggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  color: ${s("textTertiary")};
  cursor: var(--pointer);

  &:${hover} {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }
`;

const Empty = styled.span`
  color: ${s("textSecondary")};
`;

const Count = styled.span`
  color: ${s("textTertiary")};
  font-variant-numeric: tabular-nums;
`;

const Footer = styled.div`
  flex-shrink: 0;
  padding: 0 8px;
`;
