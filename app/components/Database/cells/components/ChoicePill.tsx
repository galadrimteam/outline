import styled, { useTheme } from "styled-components";
import type { DatabaseSelectChoice } from "@shared/databases/types";
import { toneColors } from "../../colors";

interface Props {
  /** The option drawn. */
  choice: Pick<DatabaseSelectChoice, "name" | "color">;
  /** Draws the dot of a status before the name. */
  status?: boolean;
}

/**
 * A select option as a coloured pill, with a dot for status options like Notion.
 *
 * @param props the option.
 * @returns the pill.
 */
export function ChoicePill({ choice, status }: Props) {
  const theme = useTheme();
  const colors = toneColors(choice.color, theme);

  return (
    <Pill
      title={choice.name}
      style={{ background: colors.background, color: colors.text }}
      $status={!!status}
    >
      {status && <Dot style={{ background: colors.dot }} />}
      <Name>{choice.name}</Name>
    </Pill>
  );
}

const Pill = styled.span<{ $status: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  min-width: 0;
  max-width: 100%;
  height: 20px;
  padding: 0 ${(props) => (props.$status ? "8px 0 7px" : "6px")};
  border-radius: ${(props) => (props.$status ? "10px" : "3px")};
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
`;

const Dot = styled.span`
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
`;

const Name = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
`;
