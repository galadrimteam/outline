import styled, { css } from "styled-components";
import type { DatabaseCellValue, DatabaseField } from "@shared/databases/types";
import type { CellVariant } from "../types";
import { NumberGauge, gaugeShare, numberShowAs } from "./NumberGauge";
import { CellText } from "./styles";

interface Props {
  field: DatabaseField;
  value: DatabaseCellValue | undefined;
  /** The number as the field formats it. */
  text: string;
  variant: CellVariant;
  wrap?: boolean;
}

/**
 * A number as Notion draws it: aligned right in a table, with the ring or
 * the bar its field asks for.
 *
 * @param props the field, the value and its text.
 * @returns the number.
 */
export function NumberValue({ field, value, text, variant, wrap }: Props) {
  const showAs = numberShowAs(field);
  const number = typeof value === "number" ? value : undefined;

  if (!showAs || number === undefined) {
    return (
      <NumberText $variant={variant} $wrap={wrap}>
        {text}
      </NumberText>
    );
  }

  const share = gaugeShare(
    number,
    showAs,
    field.options.formatting?.type === "percent"
  );
  return (
    <Gauged $variant={variant}>
      {showAs.showValue && (
        <NumberText $variant={variant} $wrap={false}>
          {text}
        </NumberText>
      )}
      <NumberGauge showAs={showAs} share={share} />
    </Gauged>
  );
}

const inTable = css`
  flex: 1 1 auto;
  min-width: 0;
`;

const NumberText = styled(CellText)`
  font-variant-numeric: tabular-nums;
  text-align: ${(props) => (props.$variant === "table" ? "right" : "left")};
  ${(props) => props.$variant === "table" && inTable}
`;

const Gauged = styled.span<{ $variant: CellVariant }>`
  display: flex;
  align-items: center;
  justify-content: ${(props) =>
    props.$variant === "table" ? "flex-end" : "flex-start"};
  gap: 8px;
  min-width: 0;
  ${(props) => props.$variant === "table" && inTable}
`;
