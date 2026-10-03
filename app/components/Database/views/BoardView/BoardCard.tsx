import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { observer } from "mobx-react";
import {
  DuplicateIcon,
  EditIcon,
  MoreIcon,
  OpenIcon,
  TrashIcon,
} from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled, { css, useTheme } from "styled-components";
import type {
  DatabaseAttachmentValue,
  DatabaseCardSize,
  DatabaseField,
  DatabaseRecord,
  DatabaseView,
} from "@shared/databases/types";
import { s, hover } from "@shared/styles";
import { DropdownMenu } from "~/components/Menu/DropdownMenu";
import Tooltip from "~/components/Tooltip";
import { createAction } from "~/actions";
import { useMenuAction } from "~/hooks/useMenuAction";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { cellTitle } from "../../boardModel";
import { compactPills } from "../../cells/components/ChoicePill";
import { getCell } from "../../cells/registry";
import { CommentCount } from "../../comments/CommentCount";
import { usePeekedRecordId } from "../../rowPeek";
import { CardProperty } from "../CardProperty";
import {
  CardHeading,
  cardTitleFontSize,
  cardTitleLineHeight,
  isShownOnCard,
  namesItself,
  recordCardColor,
} from "../GalleryView/cards";
import { CardTitleEditor } from "./CardTitleEditor";
import { borderBox } from "./styles";

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
  /** Whether a click on a property may not edit it. */
  readOnly: boolean;
  /** Whether the title is being typed in place, and how that ends. */
  renaming?: boolean;
  onRenamed?: () => void;
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
  const background = useCardBackground(database, view, record);
  const isPeeked = usePeekedRecordId(database.id) === recordId;
  const [renaming, setRenaming] = React.useState(false);
  const data: CardDragData = { type: "card", container };
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: recordId, data, disabled: readOnly || renaming });

  const handleRename = React.useCallback(() => setRenaming(true), []);
  const handleRenamed = React.useCallback(() => setRenaming(false), []);

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
        background,
      }}
      $size={view.overrides.cardSize}
      $isPlaceholder={isDragging}
      $isPeeked={isPeeked}
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
        readOnly={readOnly}
        renaming={renaming}
        onRenamed={handleRenamed}
      />
      {!readOnly && !renaming && (
        <CardMenu
          database={database}
          record={record}
          onOpen={onOpen}
          onRename={canRename(database) ? handleRename : undefined}
        />
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
  readOnly,
  onOpen,
}: Omit<SortableCardProps, "container">) {
  const { t } = useTranslation();
  const { databaseRecords } = useStores();
  const record = databaseRecords.recordById(database.id, recordId);
  const background = useCardBackground(database, view, record);
  const isPeeked = usePeekedRecordId(database.id) === recordId;

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
      style={{ background }}
      $size={view.overrides.cardSize}
      $isPeeked={isPeeked}
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
        readOnly={readOnly}
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
  const background = useCardBackground(database, view, record);
  if (!record) {
    return null;
  }
  return (
    <Card style={{ background }} $size={view.overrides.cardSize} $isOverlay>
      <CardContent
        database={database}
        view={view}
        record={record}
        fields={fields}
        readOnly
      />
    </Card>
  );
});

const CardContent = observer(function CardContent({
  database,
  view,
  record,
  fields,
  readOnly,
  renaming,
  onRenamed,
}: CardContentProps) {
  const { databaseRecords } = useStores();
  const { t } = useTranslation();
  const cover = coverOf(record, view);
  const showNames = view.options.isFieldNameHidden === false;
  const shown = fields.filter((field) =>
    isShownOnCard(field, record.fields[field.id])
  );
  const titleField = database.primaryField;

  const handleSaveTitle = React.useCallback(
    (title: string) => {
      if (!titleField) {
        return;
      }
      databaseRecords
        .update(database.id, record.id, {
          [titleField.id]: title === "" ? null : title,
        })
        .catch(() => toast.error(t("The change could not be saved")));
    },
    [database.id, databaseRecords, record.id, titleField, t]
  );

  return (
    <>
      {cover && (
        <Cover $size={view.overrides.cardSize} $fit={!!view.options.isCoverFit}>
          <img src={cover} alt="" loading="lazy" draggable={false} />
        </Cover>
      )}
      <Body>
        <Title
          database={database}
          record={record}
          editor={
            renaming && titleField && onRenamed ? (
              <CardTitleEditor
                value={cellTitle(record.fields[titleField.id])}
                onSave={handleSaveTitle}
                onClose={onRenamed}
              />
            ) : undefined
          }
        />
        {shown.length > 0 && (
          <Properties>
            {shown.map((field) => (
              <Property
                key={field.id}
                database={database}
                field={field}
                record={record}
                readOnly={readOnly}
                variant="card"
              >
                {showNames && !namesItself(field) && (
                  <PropertyName>{field.name}</PropertyName>
                )}
              </Property>
            ))}
          </Properties>
        )}
        <Comments
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
  onRename,
}: {
  database: Database;
  record: DatabaseRecord;
  onOpen: (recordId: string) => void;
  /** Starts typing the title in place; absent when it cannot be edited. */
  onRename?: () => void;
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
      <Buttons>
        {onRename && (
          <Tooltip content={t("Rename")}>
            <MenuButton aria-label={t("Rename")} onClick={onRename}>
              <EditIcon size={18} />
            </MenuButton>
          </Tooltip>
        )}
        <DropdownMenu action={action} ariaLabel={t("Card options")} align="end">
          <MenuButton aria-label={t("Card options")}>
            <MoreIcon size={18} />
          </MenuButton>
        </DropdownMenu>
      </Buttons>
    </MenuAnchor>
  );
});

function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

/**
 * Whether a card's title can be typed in place: its database has a title
 * property that the reader may write.
 *
 * @param database the database.
 * @returns true when the ✎ of a card applies.
 */
function canRename(database: Database): boolean {
  const field = database.primaryField;
  if (!field) {
    return false;
  }
  const cell = getCell(field.type);
  return !!cell.Editor && cell.isEditable(field);
}

/** The background of a card the view colours, see `recordCardColor`. */
function useCardBackground(
  database: Database,
  view: DatabaseView,
  record: DatabaseRecord | undefined
): string | undefined {
  const theme = useTheme();
  return record ? recordCardColor(database, view, record, theme) : undefined;
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

/** Space above a card's title, in px. */
const titleTop = 8;

const coverHeights: Record<DatabaseCardSize, number> = {
  small: 96,
  medium: 136,
  large: 200,
};

// Notion's card buttons: ✎ and « … » side by side in one raised group.
const Buttons = styled.div`
  display: flex;
  border-radius: 6px;
  overflow: hidden;
  background: ${s("menuBackground")};
  box-shadow: ${(props) =>
    props.theme.isDark
      ? "0 0 0 1px rgba(255, 255, 255, 0.08), 0 2px 4px rgba(0, 0, 0, 0.3)"
      : "0 0 0 1px rgba(15, 15, 15, 0.08), 0 2px 4px rgba(15, 15, 15, 0.08)"};
`;

const MenuButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${s("textSecondary")};
  cursor: var(--pointer);

  &:${hover} {
    color: ${s("text")};
    background: ${s("listItemHoverBackground")};
  }
`;

// As tall as the title's first line, to centre the button on it as Notion does.
const MenuAnchor = styled.div`
  position: absolute;
  top: ${titleTop}px;
  right: 8px;
  display: flex;
  align-items: center;
  height: ${cardTitleFontSize * cardTitleLineHeight}px;
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
  /** The card whose page is open in the side peek, framed as in Notion. */
  $isPeeked?: boolean;
}>`
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 10px;
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
    props.$isPeeked &&
    css`
      &&& {
        box-shadow:
          0 0 0 2px ${props.theme.accent},
          rgba(15, 15, 15, 0.1) 0 2px 4px;
      }
    `}

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

// Notion's card: the title 6px above the properties, each 28px tall with its
// value 5px in, the comments 6px under them, 8px round the whole.
const Body = styled.div`
  display: flex;
  flex-direction: column;
  padding: ${titleTop}px 10px 8px;
  min-width: 0;
`;

const Title = styled(CardHeading)`
  min-height: 24px;
  padding-right: 20px;
`;

const Properties = styled.div`
  display: flex;
  flex-direction: column;
  margin: 6px -4px 0;
  min-width: 0;
`;

const Property = styled(CardProperty)`
  ${borderBox}
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-height: 28px;
  padding: 5px;
  border-radius: 5px;
  font-size: 12px;
  line-height: 1.5;
  ${compactPills}
`;

const Comments = styled(CommentCount)`
  align-self: flex-start;
  margin-top: 6px;
`;

const PropertyName = styled.span`
  color: ${s("textTertiary")};
  font-size: 11px;
`;
