import type { DragEndEvent } from "@dnd-kit/core";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { observer } from "mobx-react";
import { MoreIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  DatabaseField,
  DatabaseSelectChoice,
} from "@shared/databases/types";
import { DatabaseStatusGroup } from "@shared/databases/types";
import { s } from "@shared/styles";
import NudeButton from "~/components/NudeButton";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import type { ChoiceSection } from "../choices";
import { DragHandleIcon } from "../../toolbar/icons";
import { isStatusField, moveChoice } from "../choices";
import { saveChoices } from "../saveChoices";
import { ChoiceOptionMenu } from "./ChoiceOptionMenu";
import { ChoicePill } from "./ChoicePill";
import { PopoverHeading, PopoverItem, PopoverList } from "./styles";

interface Props {
  database: Database;
  field: DatabaseField;
  /** The options to list, by status group (one section without group for plain selects). */
  sections: ChoiceSection[];
  /** Names of the selected options. */
  selected: string[];
  /** Name of the option highlighted from the keyboard. */
  activeName?: string;
  /** Whether options can be dragged to a new place (not while searching). */
  reorderable: boolean;
  onHover: (name: string) => void;
  onToggle: (name: string) => void;
}

/**
 * The options of a select field in its editor: pick, drag to reorder, and a menu per option to
 * rename, recolour or delete it.
 *
 * @param props the options and callbacks.
 * @returns the list.
 */
export const ChoiceOptionsList = observer(function ChoiceOptionsList_({
  database,
  field,
  sections,
  selected,
  activeName,
  reorderable,
  onHover,
  onToggle,
}: Props) {
  const { t } = useTranslation();
  const stores = useStores();
  const status = isStatusField(field);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const handleDragEnd = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) {
        return;
      }
      const choices = field.options.choices ?? [];
      void saveChoices(
        stores,
        database,
        field,
        moveChoice(choices, String(active.id), String(over.id))
      );
    },
    [database, field, stores]
  );

  const groupLabel = (group: DatabaseStatusGroup | null) => {
    switch (group) {
      case DatabaseStatusGroup.ToDo:
        return t("To-do");
      case DatabaseStatusGroup.InProgress:
        return t("In progress");
      case DatabaseStatusGroup.Complete:
        return t("Complete");
      default:
        return t("Other");
    }
  };

  return (
    <PopoverList role="listbox" aria-multiselectable>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        {sections.map((section) => (
          <React.Fragment key={section.group ?? "none"}>
            {status && (
              <PopoverHeading>{groupLabel(section.group)}</PopoverHeading>
            )}
            <SortableContext
              items={section.choices.map((choice) => choice.name)}
              strategy={verticalListSortingStrategy}
            >
              {section.choices.map((choice) => (
                <SortableChoice
                  key={choice.id ?? choice.name}
                  database={database}
                  field={field}
                  choice={choice}
                  status={status}
                  isSelected={selected.includes(choice.name)}
                  isActive={choice.name === activeName}
                  reorderable={reorderable}
                  onHover={onHover}
                  onToggle={onToggle}
                />
              ))}
            </SortableContext>
          </React.Fragment>
        ))}
      </DndContext>
    </PopoverList>
  );
});

interface ChoiceProps {
  database: Database;
  field: DatabaseField;
  choice: DatabaseSelectChoice;
  status: boolean;
  isSelected: boolean;
  isActive: boolean;
  reorderable: boolean;
  onHover: (name: string) => void;
  onToggle: (name: string) => void;
}

function SortableChoice({
  database,
  field,
  choice,
  status,
  isSelected,
  isActive,
  reorderable,
  onHover,
  onToggle,
}: ChoiceProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: choice.name, disabled: !reorderable });

  return (
    <Item
      ref={setNodeRef}
      role="option"
      aria-selected={isActive}
      aria-checked={isSelected}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      $dragging={isDragging}
      onMouseEnter={() => onHover(choice.name)}
      onClick={() => onToggle(choice.name)}
    >
      {reorderable && (
        <Handle
          {...attributes}
          {...listeners}
          aria-label={t("Drag to reorder")}
          onClick={(event) => event.stopPropagation()}
        >
          <DragHandleIcon />
        </Handle>
      )}
      <PillWrapper>
        <ChoicePill choice={choice} status={status} />
      </PillWrapper>
      {isSelected && <Check aria-hidden>✓</Check>}
      <ChoiceOptionMenu database={database} field={field} choice={choice}>
        <MenuButton
          aria-label={t("Edit option")}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreIcon size={18} />
        </MenuButton>
      </ChoiceOptionMenu>
    </Item>
  );
}

const Item = styled(PopoverItem)<{ $dragging: boolean }>`
  position: relative;
  z-index: ${(props) => (props.$dragging ? 1 : 0)};
  background: ${(props) =>
    props.$dragging ? props.theme.listItemHoverBackground : "transparent"};
`;

const Handle = styled.span`
  display: inline-flex;
  margin-left: -4px;
  color: ${s("textTertiary")};
  cursor: grab;
  touch-action: none;
`;

const PillWrapper = styled.span`
  flex: 1;
  min-width: 0;
  display: flex;
`;

const Check = styled.span`
  color: ${s("textSecondary")};
`;

const MenuButton = styled(NudeButton)`
  color: ${s("textTertiary")};
  opacity: 0;

  ${Item}:hover &,
  &[aria-expanded="true"] {
    opacity: 1;
  }
`;
