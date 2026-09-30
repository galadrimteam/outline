import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type { DefaultTheme } from "styled-components";
import type {
  DatabaseAttachmentValue,
  DatabaseField,
  DatabaseRecord,
  DatabaseView,
} from "@shared/databases/types";
import { ellipsis, s } from "@shared/styles";
import { DateMentionText } from "~/components/DateMentionText";
import type Database from "~/models/Database";
import { cellTitle } from "../../boardModel";
import { toneColors } from "../../colors";
import { attachmentsOf, isImageAttachment } from "../../cells/AttachmentCell";
import { isEmptyCellValue } from "../../cells/format";
import { getCell } from "../../cells/registry";
import { cardFields } from "../../toolbar/columns";

/**
 * Returns the title of a row: its primary field as text.
 *
 * @param database the database.
 * @param record the row.
 * @returns the title, "" when empty.
 */
export function recordTitle(
  database: Database,
  record: DatabaseRecord
): string {
  const primary = database.primaryField;
  return primary ? cellTitle(record.fields[primary.id]) : "";
}

/**
 * Returns the emoji of a row, when the database keeps one in a field.
 *
 * @param database the database.
 * @param record the row.
 * @returns the emoji, or undefined.
 */
export function recordIcon(
  database: Database,
  record: DatabaseRecord
): string | undefined {
  const fieldId = database.settings?.iconFieldId;
  const value = fieldId ? record.fields[fieldId] : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Returns the image shown as the cover of a card: the first image of the
 * view's cover property.
 *
 * @param view the view.
 * @param record the row.
 * @returns the attachment, or undefined.
 */
export function recordCover(
  view: Pick<DatabaseView, "options">,
  record: DatabaseRecord
): DatabaseAttachmentValue | undefined {
  const fieldId = view.options.coverFieldId;
  if (!fieldId) {
    return undefined;
  }
  return attachmentsOf(record.fields[fieldId]).find(isImageAttachment);
}

/**
 * Returns the properties shown on the cards of a view.
 *
 * @param database the database.
 * @param view the view.
 * @returns the visible fields, the title aside.
 */
export function visibleCardFields(
  database: Database,
  view: Pick<DatabaseView, "type" | "columnMeta">
): DatabaseField[] {
  return cardFields(database.fields ?? [], view);
}

/**
 * Returns the background of a card when the view colours cards: by the option
 * of a select property (`options.colorConfig.fieldId`) or with one colour.
 *
 * @param database the database.
 * @param view the view.
 * @param record the row.
 * @param theme the current theme.
 * @returns the colour, or undefined for the default card background.
 */
export function recordColor(
  database: Database,
  view: Pick<DatabaseView, "options">,
  record: DatabaseRecord,
  theme: Pick<DefaultTheme, "isDark">
): string | undefined {
  const config = view.options.colorConfig;
  if (config?.type === "custom" && config.color) {
    return toneColors(config.color, theme).background;
  }
  if (config?.type !== "field" || !config.fieldId) {
    return undefined;
  }
  const field = database.fieldById(config.fieldId);
  const value = record.fields[config.fieldId];
  const name = Array.isArray(value) ? value[0] : value;
  const choice = field?.options.choices?.find((c) => c.name === name);
  return choice ? toneColors(choice.color, theme).background : undefined;
}

interface TitleProps {
  database: Database;
  record: DatabaseRecord;
}

/**
 * The title of a card or a row, with its emoji; « Untitled » when empty.
 *
 * @param props the database and the row.
 * @returns the title.
 */
export const RecordTitle = observer(function RecordTitle({
  database,
  record,
}: TitleProps) {
  const { t } = useTranslation();
  const title = recordTitle(database, record);
  const icon = recordIcon(database, record);

  return (
    <>
      {icon && <Emoji aria-hidden>{icon}</Emoji>}
      {title ? (
        <span>
          <DateMentionText text={title} />
        </span>
      ) : (
        <Untitled>{t("Untitled")}</Untitled>
      )}
    </>
  );
});

interface PropertiesProps {
  database: Database;
  record: DatabaseRecord;
  fields: DatabaseField[];
  /** Shows the property name above each value. */
  showNames?: boolean;
  /** Lays values on one line (list rows) instead of one per line (cards). */
  inline?: boolean;
}

/**
 * The visible properties of a row drawn like Notion's cards: empty ones are
 * left out, values use the cell renderers.
 *
 * @param props the row and the fields to show.
 * @returns the properties.
 */
export const CardProperties = observer(function CardProperties({
  database,
  record,
  fields,
  showNames,
  inline,
}: PropertiesProps) {
  const filled = fields.filter(
    (field) => !isEmptyCellValue(record.fields[field.id])
  );
  if (!filled.length) {
    return null;
  }

  return (
    <Properties $inline={inline}>
      {filled.map((field) => {
        const { Renderer } = getCell(field.type);
        return (
          <Property key={field.id} $inline={inline} title={field.name}>
            {showNames && <PropertyName>{field.name}</PropertyName>}
            <Renderer
              field={field}
              value={record.fields[field.id]}
              database={database}
              record={record}
              variant={inline ? "table" : "card"}
            />
          </Property>
        );
      })}
    </Properties>
  );
});

/**
 * Props making a card open its row on click and on Enter or Space.
 *
 * @param onOpen opens the row.
 * @param options.withSpace false when Space is kept for dragging the card.
 * @returns the props to spread on the card element.
 */
export function openableProps(
  onOpen: () => void,
  { withSpace = true }: { withSpace?: boolean } = {}
) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: (ev: React.MouseEvent) => {
      if (isInteractiveTarget(ev.target, ev.currentTarget)) {
        return;
      }
      onOpen();
    },
    onKeyDown: (ev: React.KeyboardEvent) => {
      if (ev.target !== ev.currentTarget) {
        return;
      }
      if (ev.key === "Enter" || (withSpace && ev.key === " ")) {
        ev.preventDefault();
        onOpen();
      }
    },
  };
}

function isInteractiveTarget(target: EventTarget, container: EventTarget) {
  let node = target instanceof Element ? target : null;
  while (node && node !== container) {
    if (node.matches("a, button, input, textarea, select, [role='button']")) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

const Emoji = styled.span`
  margin-inline-end: 6px;
`;

const Untitled = styled.span`
  color: ${s("placeholder")};
`;

const Properties = styled.div<{ $inline?: boolean }>`
  display: flex;
  flex-direction: ${(props) => (props.$inline ? "row" : "column")};
  align-items: ${(props) => (props.$inline ? "center" : "stretch")};
  gap: ${(props) => (props.$inline ? "12px" : "4px")};
  min-width: 0;
`;

const Property = styled.div<{ $inline?: boolean }>`
  min-width: 0;
  max-width: ${(props) => (props.$inline ? "220px" : "none")};
  font-size: 13px;
  color: ${s("textSecondary")};
  ${(props) => props.$inline && ellipsis()}
`;

const PropertyName = styled.div`
  color: ${s("textTertiary")};
  font-size: 11px;
  ${ellipsis()}
`;
