import { CloseIcon, DuplicateIcon, TrashIcon } from "outline-icons";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import NudeButton from "~/components/NudeButton";

interface Props {
  count: number;
  onDuplicate: () => void;
  onDelete: () => void;
  onClear: () => void;
}

/**
 * The actions on the selected rows, shown above the table while rows are selected.
 *
 * @param props the number of selected rows and the actions.
 * @returns the bar.
 */
export function SelectionBar({ count, onDuplicate, onDelete, onClear }: Props) {
  const { t } = useTranslation();

  return (
    <Bar role="toolbar" aria-label={t("Selected rows")}>
      <Count>{t("{{ count }} selected", { count })}</Count>
      <Action type="button" onClick={onDuplicate}>
        <DuplicateIcon size={18} />
        {t("Duplicate")}
      </Action>
      <Action type="button" $danger onClick={onDelete}>
        <TrashIcon size={18} />
        {t("Delete")}
      </Action>
      <NudeButton aria-label={t("Clear selection")} onClick={onClear}>
        <CloseIcon size={18} />
      </NudeButton>
    </Bar>
  );
}

const Bar = styled.div`
  position: absolute;
  top: -40px;
  left: 52px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 32px;
  padding: 0 4px 0 10px;
  border-radius: 6px;
  background: ${s("menuBackground")};
  box-shadow: ${s("menuShadow")};
  font-size: 14px;
`;

const Count = styled.span`
  margin-right: 6px;
  color: ${s("accent")};
  font-weight: 500;
`;

const Action = styled.button<{ $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: none;
  font: inherit;
  color: ${(props) => (props.$danger ? props.theme.danger : props.theme.text)};
  cursor: var(--pointer);

  svg {
    fill: currentColor;
  }

  &:hover {
    background: ${s("listItemHoverBackground")};
  }
`;
