import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { observer } from "mobx-react";
import { DuplicateIcon, MoreIcon, OpenIcon, TrashIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled, { css } from "styled-components";
import type {
  DatabaseAttachmentValue,
  DatabaseCardSize,
  DatabaseField,
  DatabaseRecord,
  DatabaseView,
} from "@shared/databases/types";
import EmojiIcon from "@shared/components/EmojiIcon";
import { s, hover } from "@shared/styles";
import { DropdownMenu } from "~/components/Menu/DropdownMenu";
import { createAction } from "~/actions";
import { useMenuAction } from "~/hooks/useMenuAction";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { isEmptyCell } from "~/stores/DatabaseRecordsStore";
import { cellTitle } from "../../boardModel";
import { getCell } from "../../cells/registry";
import { CommentCount } from "../../comments/CommentCount";

/** Drag data of a card, read by the board's collision detection. */
export interface CardDragData {
  type: "card";
  /** The column, or column within a lane, the card is in. */
  container: string;
}

interface CardContentProps {
  database: Database;
  view: DatabaseView;
  record: DatabaseRecord;
  /** The properties shown under the title. */
  fields: DatabaseField[];
}

interface SortableCardProps {
  database: Database;
  view: DatabaseView;
  recordId: string;
  container: string;
  fields: DatabaseField[];
  readOnly: boolean;
  onOpen: (recordId: string) => void;
}

/**
 * A draggable board card. Enter or a click opens the row's page; Space picks
 * the card up to move it with the arrow keys.
 */
export const SortableCard = observer(function SortableCard({
  database,
  view,
  recordId,
  container,
  fields,
  readOnly,
  onOpen,
}: SortableCardProps) {
  const { t } = useTranslation();
  const { databaseRecords } = useStores();
  const record = databaseRecords.recordById(database.id, recordId);
  const data: CardDragData = { type: "card", container };
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: recordId, data, disabled: readOnly });

  const handleClick = React.useCallback(() => {
    onOpen(recordId);
  }, [onOpen, recordId]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" && event.target === event.currentTarget) {
        event.preventDefault();
        onOpen(recordId);
        return;
      }
      // The sortable's own key handler starts keyboard dragging with Space.
      listeners?.onKeyDown?.(event);
    },
    [onOpen, recordId, listeners]
  );

  if (!record) {
    return null;
  }

  const title = cellTitle(
    database.primaryField ? record.fields[database.primaryField.id] : undefined
  );

  return (
    <Card
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      $size={view.overrides.cardSize}
      $isPlaceholder={isDragging}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={title || t("Untitled")}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <CardContent
        database={database}
        view={view}
        record={record}
        fields={fields}
      />
      {!readOnly && (
        <CardMenu database={database} record={record} onOpen={onOpen} />
      )}
    </Card>
  );
});

/**
 * A card that is only shown, not dragged: the copy of a card with several
 * values in the lanes of its other values.
 */
export const StaticCard = observer(function StaticCard({
  database,
  view,
  recordId,
  fields,
  onOpen,
}: Omit<SortableCardProps, "container" | "readOnly">) {
  const { t } = useTranslation();
  const { databaseRecords } = useStores();
  const record = databaseRecords.recordById(database.id, recordId);

  const handleClick = React.useCallback(
    () => onOpen(recordId),
    [onOpen, recordId]
  );
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onOpen(recordId);
      }
    },
    [onOpen, recordId]
  );

  if (!record) {
    return null;
  }
  const title = cellTitle(
    database.primaryField ? record.fields[database.primaryField.id] : undefined
  );

  return (
    <Card
      $size={view.overrides.cardSize}
      role="button"
      tabIndex={0}
      aria-label={title || t("Untitled")}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <CardContent
        database={database}
        view={view}
        record={record}
        fields={fields}
      />
    </Card>
  );
});

/**
 * The card drawn under the pointer while it is dragged.
 */
export const CardOverlay = observer(function CardOverlay({
  database,
  view,
  recordId,
  fields,
}: Omit<SortableCardProps, "container" | "readOnly" | "onOpen">) {
  const { databaseRecords } = useStores();
  const record = databaseRecords.recordById(database.id, recordId);
  if (!record) {
    return null;
  }
  return (
    <Card $size={view.overrides.cardSize} $isOverlay>
      <CardContent
        database={database}
        view={view}
        record={record}
        fields={fields}
      />
    </Card>
  );
});

const CardContent = observer(function CardContent({
  database,
  view,
  record,
  fields,
}: CardContentProps) {
  const { t } = useTranslation();
  const primary = database.primaryField;
  const title = cellTitle(primary ? record.fields[primary.id] : undefined);
  const iconFieldId = database.settings?.iconFieldId;
  const icon = iconFieldId ? record.fields[iconFieldId] : undefined;
  const cover = coverOf(record, view);
  const showNames = view.options.isFieldNameHidden === false;

  return (
    <>
      {cover && (
        <Cover $size={view.overrides.cardSize} $fit={!!view.options.isCoverFit}>
          <img src={cover} alt="" loading="lazy" draggable={false} />
        </Cover>
      )}
      <Body>
        <Title $empty={!title}>
          {typeof icon === "string" && icon && (
            <CardIcon emoji={icon} size={18} />
          )}
          <span>{title || t("Untitled")}</span>
        </Title>
        {fields.map((field) => {
          const value = record.fields[field.id];
          if (isEmptyCell(value) || value === false) {
            return null;
          }
          const { Renderer } = getCell(field.type);
          return (
            <Property key={field.id}>
              {showNames && <PropertyName>{field.name}</PropertyName>}
              <Renderer
                field={field}
                value={value}
                database={database}
                variant="card"
                record={record}
              />
            </Property>
          );
        })}
        <CommentCount
          databaseId={database.id}
          recordId={record.id}
          documentId={record.documentId}
        />
      </Body>
    </>
  );
});

const CardMenu = observer(function CardMenu({
  database,
  record,
  onOpen,
}: {
  database: Database;
  record: DatabaseRecord;
  onOpen: (recordId: string) => void;
}) {
  const { t } = useTranslation();
  const { databaseRecords } = useStores();

  const action = useMenuAction([
    createAction({
      name: t("Open"),
      section: "Database",
      icon: <OpenIcon />,
      perform: () => onOpen(record.id),
    }),
    createAction({
      name: t("Duplicate"),
      section: "Database",
      icon: <DuplicateIcon />,
      perform: () =>
        databaseRecords
          .duplicate(database.id, record.id)
          .catch(() => toast.error(t("Couldn’t duplicate the card"))),
    }),
    createAction({
      name: t("Delete"),
      section: "Database",
      icon: <TrashIcon />,
      dangerous: true,
      perform: () =>
        databaseRecords
          .delete(database.id, [record.id])
          .catch(() => toast.error(t("Couldn’t delete the card"))),
    }),
  ]);

  return (
    <MenuAnchor
      onPointerDown={stopPropagation}
      onMouseDown={stopPropagation}
      onTouchStart={stopPropagation}
      onClick={stopPropagation}
      onKeyDown={stopPropagation}
    >
      <DropdownMenu action={action} ariaLabel={t("Card options")} align="end">
        <MenuButton aria-label={t("Card options")}>
          <MoreIcon size={18} />
        </MenuButton>
      </DropdownMenu>
    </MenuAnchor>
  );
});

function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

function coverOf(
  record: DatabaseRecord,
  view: DatabaseView
): string | undefined {
  const fieldId = view.options.coverFieldId;
  const value = fieldId ? record.fields[fieldId] : undefined;
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items: unknown[] = value;
  const image = items.find(
    (item): item is DatabaseAttachmentValue =>
      typeof item === "object" &&
      item !== null &&
      "mimetype" in item &&
      typeof item.mimetype === "string" &&
      item.mimetype.startsWith("image/")
  );
  return image?.thumbnailUrl ?? image?.url;
}

const coverHeights: Record<DatabaseCardSize, number> = {
  small: 96,
  medium: 136,
  large: 200,
};

const MenuButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: ${s("menuBackground")};
  color: ${s("textSecondary")};
  box-shadow: ${(props) =>
    props.theme.isDark
      ? "0 0 0 1px rgba(255, 255, 255, 0.08), 0 2px 4px rgba(0, 0, 0, 0.3)"
      : "0 0 0 1px rgba(15, 15, 15, 0.08), 0 2px 4px rgba(15, 15, 15, 0.08)"};
  cursor: var(--pointer);

  &:${hover} {
    color: ${s("text")};
  }
`;

const MenuAnchor = styled.div`
  position: absolute;
  top: 6px;
  right: 6px;
  opacity: 0;
  transition: opacity 100ms ease-in-out;

  &:focus-within,
  &:has([data-state="open"]) {
    opacity: 1;
  }
`;

const Card = styled.div<{
  $size?: DatabaseCardSize;
  $isPlaceholder?: boolean;
  $isOverlay?: boolean;
}>`
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
  background: ${(props) => (props.theme.isDark ? "#252525" : props.theme.background)};
  box-shadow: ${(props) =>
    props.theme.isDark
      ? "rgba(255, 255, 255, 0.094) 0 0 0 1px, rgba(0, 0, 0, 0.2) 0 2px 4px"
      : "rgba(15, 15, 15, 0.1) 0 0 0 1px, rgba(15, 15, 15, 0.1) 0 2px 4px"};
  color: ${s("text")};
  cursor: var(--pointer);
  user-select: none;
  -webkit-touch-callout: none;
  touch-action: manipulation;
  outline: none;
  transition: background 100ms ease-in-out;

  &:${hover} {
    background: ${(props) =>
      props.theme.isDark ? "#2c2c2c" : "rgb(250, 250, 249)"};
  }

  &:${hover} ${MenuAnchor} {
    opacity: 1;
  }

  &:focus-visible {
    box-shadow:
      0 0 0 2px ${s("accent")},
      rgba(15, 15, 15, 0.1) 0 2px 4px;
  }

  ${(props) =>
    props.$isPlaceholder &&
    css`
      opacity: 0.4;
    `}

  ${(props) =>
    props.$isOverlay &&
    css`
      cursor: grabbing;
      transform: rotate(1.5deg) scale(1.02);
      box-shadow: ${
        props.theme.isDark
          ? "rgba(255, 255, 255, 0.094) 0 0 0 1px, rgba(0, 0, 0, 0.4) 0 12px 28px"
          : "rgba(15, 15, 15, 0.08) 0 0 0 1px, rgba(15, 15, 15, 0.16) 0 12px 28px"
      };
    `}
`;

const Cover = styled.div<{ $size?: DatabaseCardSize; $fit: boolean }>`
  height: ${(props) => coverHeights[props.$size ?? "medium"]}px;
  border-bottom: 1px solid ${s("divider")};
  background: ${s("backgroundSecondary")};

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: ${(props) => (props.$fit ? "contain" : "cover")};
  }
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px 10px;
  min-width: 0;
`;

const Title = styled.div<{ $empty: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding-right: 20px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  overflow-wrap: anywhere;
  color: ${(props) => (props.$empty ? props.theme.placeholder : props.theme.text)};
`;

const CardIcon = styled(EmojiIcon)`
  flex-shrink: 0;
  margin-top: 2px;
`;

const Property = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
`;

const PropertyName = styled.span`
  color: ${s("textTertiary")};
  font-size: 11px;
`;
