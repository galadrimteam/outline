import { CloseIcon, DocumentIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import styled, { css } from "styled-components";
import type { DatabaseField, DatabaseLinkValue } from "@shared/databases/types";
import { s } from "@shared/styles";
import NudeButton from "~/components/NudeButton";
import useStores from "~/hooks/useStores";
import { databaseRowPath } from "~/utils/routeHelpers";
import { IconGlyph } from "../RowIcon";
import { linkIcon } from "../rowIcons";
import { EditorPopover } from "./components/EditorPopover";
import {
  Chips,
  EmptyValue,
  PopoverItem,
  PopoverList,
  SearchInput,
} from "./components/styles";
import { isWritable } from "./editable";
import { isLinkItem, toArray } from "./format";
import {
  moveCaretToEnd,
  stopPropagation,
  useDebouncedValue,
  useListNavigation,
} from "./hooks";
import type {
  CellDefinition,
  CellEditorProps,
  CellRendererProps,
} from "./types";

/** Relations: the titles of the linked rows, each opening the linked row's page. */
export const linkCell: CellDefinition = {
  Renderer: LinkRenderer,
  Editor: LinkEditor,
  isEditable: isWritable,
  opensOnTyping: true,
};

/**
 * The linked rows of a relation cell.
 *
 * @param value the cell value.
 * @returns the linked rows, in order.
 */
export function linksOf(
  value: CellRendererProps["value"]
): DatabaseLinkValue[] {
  return toArray(value).filter(isLinkItem);
}

/**
 * The app path that opens a linked row's page, in the database of the linked table.
 *
 * @param field the relation field.
 * @param recordId the linked row.
 * @returns the path, or null when the linked table has no Outline database: its rows have no page.
 */
export function linkedRecordPath(
  field: DatabaseField,
  recordId: string
): string | null {
  const { foreignDatabaseId } = field.options;
  return foreignDatabaseId
    ? databaseRowPath(foreignDatabaseId, recordId)
    : null;
}

function LinkRenderer({ field, value, variant, wrap }: CellRendererProps) {
  const { t } = useTranslation();
  const links = linksOf(value);

  if (!links.length) {
    return variant === "property" ? (
      <EmptyValue>{t("Empty")}</EmptyValue>
    ) : null;
  }

  const iconSize = variant === "card" ? 14 : 16;

  return (
    <Chips $variant={variant} $wrap={wrap}>
      {links.map((link) => {
        const path = linkedRecordPath(field, link.id);
        const icon = linkIcon(link);
        const content = (
          <>
            {icon ? (
              <IconGlyph icon={icon} size={iconSize} />
            ) : (
              <DocumentIcon size={iconSize} />
            )}
            <ChipTitle>{link.title || t("Untitled")}</ChipTitle>
          </>
        );
        return path ? (
          <LinkChip key={link.id} to={path} onClick={stopPropagation}>
            {content}
          </LinkChip>
        ) : (
          <PlainChip key={link.id}>{content}</PlainChip>
        );
      })}
    </Chips>
  );
}

function LinkEditor(props: CellEditorProps) {
  const { database, field, value, record, onChange, onClose, initialInput } =
    props;
  const { t } = useTranslation();
  const { databaseRecords } = useStores();
  const multiple = isMultipleLink(field);
  const [selected, setSelected] = React.useState(() => linksOf(value));
  const [query, setQuery] = React.useState(initialInput ?? "");
  const search = useDebouncedValue(query);
  const [candidates, setCandidates] = React.useState<DatabaseLinkValue[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    void databaseRecords
      .linkCandidates(database.id, field.id, {
        recordId: record?.id,
        search: search || undefined,
        limit: 50,
      })
      .then((rows) => {
        if (!cancelled) {
          setCandidates(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCandidates([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [database.id, databaseRecords, field.id, record?.id, search]);

  const write = React.useCallback(
    (links: DatabaseLinkValue[]) => {
      if (multiple) {
        onChange(links.length ? links : null);
        return;
      }
      onChange(links[0] ?? null);
    },
    [multiple, onChange]
  );

  const handleToggle = React.useCallback(
    (link: DatabaseLinkValue) => {
      const isSelected = selected.some((item) => item.id === link.id);
      if (!multiple) {
        const next = isSelected ? [] : [link];
        setSelected(next);
        write(next);
        onClose();
        return;
      }
      const next = isSelected
        ? selected.filter((item) => item.id !== link.id)
        : [...selected, link];
      setSelected(next);
      write(next);
    },
    [multiple, onClose, selected, write]
  );

  const handlePick = React.useCallback(
    (index: number) => {
      const link = candidates[index];
      if (link) {
        handleToggle(link);
      }
    },
    [candidates, handleToggle]
  );

  const { active, setActive, handleKeyDown } = useListNavigation(
    candidates.length,
    handlePick,
    { query, onEnterWithoutPick: onClose }
  );

  return (
    <EditorPopover
      anchor={<LinkRenderer {...props} />}
      label={t("Edit relation")}
      onClose={onClose}
      width={320}
    >
      {selected.length > 0 && (
        <Selected>
          {selected.map((link) => (
            <SelectedChip key={link.id}>
              <ChipTitle>{link.title || t("Untitled")}</ChipTitle>
              <NudeButton
                size={16}
                aria-label={t("Remove")}
                onClick={() => handleToggle(link)}
              >
                <CloseIcon size={16} />
              </NudeButton>
            </SelectedChip>
          ))}
        </Selected>
      )}
      <SearchInput
        autoFocus
        placeholder={t("Search for a page…")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={moveCaretToEnd}
      />
      <PopoverList role="listbox" aria-multiselectable={multiple}>
        {candidates.map((link, index) => (
          <PopoverItem
            key={link.id}
            role="option"
            aria-selected={index === active}
            aria-checked={selected.some((item) => item.id === link.id)}
            onMouseEnter={() => setActive(index)}
            onClick={() => handleToggle(link)}
          >
            <DocumentIcon size={18} />
            <ChipTitle>{link.title || t("Untitled")}</ChipTitle>
            {selected.some((item) => item.id === link.id) && <Check>✓</Check>}
          </PopoverItem>
        ))}
        {!candidates.length && <NoResult>{t("No results")}</NoResult>}
      </PopoverList>
    </EditorPopover>
  );
}

function isMultipleLink(field: DatabaseField): boolean {
  const relationship = field.options.relationship;
  if (relationship) {
    return relationship === "manyMany" || relationship === "oneMany";
  }
  return field.isMultipleCellValue;
}

const chip = css`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  max-width: 100%;
  flex-shrink: 0;
  font-weight: 500;

  > svg {
    flex-shrink: 0;
    fill: ${s("textTertiary")};
  }
`;

const PlainChip = styled.span`
  ${chip}
  color: ${s("text")};
`;

/* `&&` outranks the editor's rule colouring every link of a document. */
const LinkChip = styled(Link)`
  ${chip}

  && {
    color: ${s("text")};
    text-decoration: underline;
    text-decoration-color: ${s("divider")};
    text-underline-offset: 2px;
  }

  &&:hover {
    text-decoration-color: ${s("textSecondary")};
  }
`;

const ChipTitle = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Selected = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 12px 0;
`;

const SelectedChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 2px 4px 2px 8px;
  border-radius: 4px;
  font-size: 13px;
  background: ${s("backgroundSecondary")};
`;

const Check = styled.span`
  margin-left: auto;
  color: ${s("textSecondary")};
`;

const NoResult = styled.div`
  padding: 8px 12px;
  font-size: 14px;
  color: ${s("textTertiary")};
`;
