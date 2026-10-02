import { observer } from "mobx-react";
import { EyeIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";
import type { DatabaseField } from "@shared/databases/types";
import { s, hover } from "@shared/styles";
import type { RecordQuery } from "~/stores/DatabaseRecordsStore";
import type { BoardColumn } from "../../boardModel";
import { EMPTY_STACK } from "../../boardModel";
import { toneColors } from "../../colors";
import { borderBox } from "./styles";

interface Props {
  field: DatabaseField;
  columns: BoardColumn[];
  queries: Map<string, RecordQuery>;
  readOnly: boolean;
  onShow: (key: string) => void;
}

/**
 * Notion's « Hidden groups » column: the folded columns with their counts,
 * shown again with a click.
 */
export const HiddenGroups = observer(function HiddenGroups({
  field,
  columns,
  queries,
  readOnly,
  onShow,
}: Props) {
  const { t } = useTranslation();

  return (
    <Wrapper aria-label={t("Hidden groups")}>
      <Heading>{t("Hidden groups")}</Heading>
      {columns.map((column) => (
        <HiddenGroup
          key={column.key}
          field={field}
          column={column}
          query={queries.get(column.key)}
          readOnly={readOnly}
          onShow={onShow}
        />
      ))}
    </Wrapper>
  );
});

const HiddenGroup = observer(function HiddenGroup({
  field,
  column,
  query,
  readOnly,
  onShow,
}: {
  field: DatabaseField;
  column: BoardColumn;
  query: RecordQuery | undefined;
  readOnly: boolean;
  onShow: (key: string) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const tone = toneColors(column.color, theme);
  const name =
    column.key === EMPTY_STACK
      ? t("No {{ name }}", { name: field.name })
      : column.key;
  const handleClick = React.useCallback(
    () => onShow(column.key),
    [onShow, column.key]
  );

  return (
    <Row
      type="button"
      onClick={handleClick}
      disabled={readOnly}
      aria-label={t("Show {{ name }}", { name })}
    >
      <Chip style={{ background: tone.background, color: tone.text }}>
        {name}
      </Chip>
      <Count>{query?.isLoaded ? query.total : ""}</Count>
      {!readOnly && <ShowIcon size={18} />}
    </Row>
  );
});

const Wrapper = styled.section`
  display: flex;
  flex-direction: column;
  flex: 0 0 220px;
  gap: 2px;
  align-self: flex-start;
  padding: 0 4px;
`;

const Heading = styled.div`
  ${borderBox}
  display: flex;
  align-items: center;
  min-height: 42px;
  padding: 8px 6px 6px;
  color: ${s("textTertiary")};
  font-size: 14px;
  font-weight: 500;
`;

const ShowIcon = styled(EyeIcon)`
  margin-left: auto;
  opacity: 0;
  flex-shrink: 0;
`;

const Row = styled.button`
  ${borderBox}
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: ${s("textSecondary")};
  font: inherit;
  text-align: left;
  cursor: var(--pointer);

  &:disabled {
    cursor: default;
  }

  &:${hover}:not(:disabled) {
    background: ${(props) =>
      props.theme.isDark
        ? "rgba(255, 255, 255, 0.06)"
        : "rgba(55, 53, 47, 0.06)"};

    ${ShowIcon} {
      opacity: 1;
    }
  }
`;

const Chip = styled.span`
  display: inline-block;
  max-width: 140px;
  overflow: hidden;
  padding: 0 8px;
  border-radius: 11px;
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Count = styled.span`
  color: ${s("textTertiary")};
  font-size: 14px;
  font-variant-numeric: tabular-nums;
`;
