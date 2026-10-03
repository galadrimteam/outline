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
import { compactPills } from "../../cells/components/ChoicePill";
import { isEmptyCellValue } from "../../cells/format";
import { RowIcon } from "../../RowIcon";
import { cardFields } from "../../toolbar/columns";
import { CardProperty } from "../CardProperty";

/** Font size of the title of a board or gallery card, in px. */
export const cardTitleFontSize = 15;

/** Line height of the title of a board or gallery card, a multiple of its font size. */
export const cardTitleLineHeight = 1.5;

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
 * Returns the colour name of a row when the view colours its rows: the colour
 * of its option of a select property (`options.colorConfig.fieldId`, Notion's
 * conditional colour matching a property's value), or one colour for all.
 *
 * @param database the database.
 * @param view the view.
 * @param record the row.
 * @returns the engine colour name, or undefined when the row is not coloured.
 */
export function recordColorName(
  database: Pick<Database, "fieldById">,
  view: Pick<DatabaseView, "options">,
  record: DatabaseRecord
): string | undefined {
  const config = view.options.colorConfig;
  if (config?.type === "custom" && config.color) {
    return config.color;
  }
  if (config?.type !== "field" || !config.fieldId) {
    return undefined;
  }
  const field = database.fieldById(config.fieldId);
  const value = record.fields[config.fieldId];
  const name = Array.isArray(value) ? value[0] : value;
  return field?.options.choices?.find((c) => c.name === name)?.color;
}

/**
 * Returns the colour of a calendar or timeline item when the view colours its
 * rows, see `recordColorName`.
 *
 * @param database the database.
 * @param view the view.
 * @param record the row.
 * @param theme the current theme.
 * @returns the colour, or undefined for the default background.
 */
export function recordColor(
  database: Pick<Database, "fieldById">,
  view: Pick<DatabaseView, "options">,
  record: DatabaseRecord,
  theme: Pick<DefaultTheme, "isDark">
): string | undefined {
  const name = recordColorName(database, view, record);
  return name ? toneColors(name, theme).background : undefined;
}

/**
 * Returns the background of a board or gallery card when the view colours its
 * rows, see `recordColorName`.
 *
 * @param database the database.
 * @param view the view.
 * @param record the row.
 * @param theme the current theme.
 * @returns the colour, or undefined for the default card background.
 */
export function recordCardColor(
  database: Pick<Database, "fieldById">,
  view: Pick<DatabaseView, "options">,
  record: DatabaseRecord,
  theme: Pick<DefaultTheme, "isDark">
): string | undefined {
  const name = recordColorName(database, view, record);
  return name ? toneColors(name, theme).card : undefined;
}

interface TitleProps {
  database: Database;
  record: DatabaseRecord;
  /** Size of the row's icon, in px. */
  iconSize?: number;
  /** False when the row's icon is drawn apart. */
  showIcon?: boolean;
}

/**
 * The title of a card or a row, after the icon of its page; « Untitled » when
 * empty.
 *
 * @param props the database and the row.
 * @returns the title.
 */
export const RecordTitle = observer(function RecordTitle({
  database,
  record,
  iconSize = 14,
  showIcon = true,
}: TitleProps) {
  const { t } = useTranslation();
  const title = recordTitle(database, record);

  return (
    <>
      {showIcon && (
        <TitleIcon database={database} record={record} size={iconSize} />
      )}
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

interface HeadingProps {
  database: Database;
  record: DatabaseRecord;
  className?: string;
}

/**
 * The title of a board or gallery card after the icon of its page, wrapped
 * on as many lines as it needs, in Notion's card type.
 *
 * @param props the database and the row.
 * @returns the heading.
 */
export const CardHeading = observer(function CardHeading({
  database,
  record,
  className,
}: HeadingProps) {
  const { t } = useTranslation();
  const title = recordTitle(database, record);

  return (
    <Heading className={className} $empty={!title}>
      <HeadingIcon database={database} record={record} size={18} />
      <span>{title ? <DateMentionText text={title} /> : t("Untitled")}</span>
    </Heading>
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
  /** False when a click on a property edits it, as in Notion, instead of opening the row. */
  readOnly?: boolean;
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
  readOnly = true,
}: PropertiesProps) {
  const filled = fields.filter(
    (field) => !isEmptyCellValue(record.fields[field.id])
  );
  if (!filled.length) {
    return null;
  }

  return (
    <Properties $inline={inline}>
      {filled.map((field) => (
        <Property
          key={field.id}
          database={database}
          field={field}
          record={record}
          readOnly={readOnly}
          variant={inline ? "table" : "card"}
          title={field.name}
          $inline={inline}
        >
          {showNames && <PropertyName>{field.name}</PropertyName>}
        </Property>
      ))}
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

const TitleIcon = styled(RowIcon)`
  margin-inline-end: 6px;
  vertical-align: text-bottom;
`;

const Untitled = styled.span`
  color: ${s("placeholder")};
`;

// Notion's measures: the title 26px after the icon's left edge, weight 500.
const Heading = styled.div<{ $empty: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  font-size: ${cardTitleFontSize}px;
  font-weight: 500;
  line-height: ${cardTitleLineHeight};
  overflow-wrap: anywhere;
  color: ${(props) => (props.$empty ? props.theme.placeholder : props.theme.text)};
`;

const HeadingIcon = styled(RowIcon)`
  margin-top: 2px;
`;

const Properties = styled.div<{ $inline?: boolean }>`
  display: flex;
  flex-direction: ${(props) => (props.$inline ? "row" : "column")};
  align-items: ${(props) => (props.$inline ? "center" : "stretch")};
  gap: ${(props) => (props.$inline ? "12px" : "4px")};
  min-width: 0;
`;

const Property = styled(CardProperty)<{ $inline?: boolean }>`
  min-width: 0;
  max-width: ${(props) => (props.$inline ? "220px" : "none")};
  font-size: ${(props) => (props.$inline ? 13 : 12)}px;
  color: ${s("textSecondary")};
  ${(props) => (props.$inline ? ellipsis() : compactPills)}
`;

const PropertyName = styled.div`
  color: ${s("textTertiary")};
  font-size: 11px;
  ${ellipsis()}
`;
