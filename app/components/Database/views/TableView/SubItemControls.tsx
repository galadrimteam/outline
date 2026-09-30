import { ArrowIcon, CollapsedIcon } from "outline-icons";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { ellipsis, s } from "@shared/styles";

/** Indentation of each level of sub-items. */
const INDENT = 20;

interface ToggleProps {
  /** How deep the row is nested. */
  level: number;
  /** Whether the row has sub-items to unfold. */
  hasChildren: boolean;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * What a nested table puts before a row's title, like Notion: the indentation
 * of its level and the triangle that unfolds its sub-items.
 *
 * @param props the level of the row and its sub-items.
 * @returns the toggle.
 */
export function SubItemToggle({
  level,
  hasChildren,
  expanded,
  onToggle,
}: ToggleProps) {
  const { t } = useTranslation();

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onToggle();
  };

  return (
    <Leading style={{ paddingInlineStart: level * INDENT }}>
      {hasChildren ? (
        <Toggle
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? t("Hide sub-items") : t("Show sub-items")}
          $expanded={expanded}
          onClick={handleClick}
        >
          <CollapsedIcon size={18} />
        </Toggle>
      ) : (
        <Placeholder />
      )}
    </Leading>
  );
}

/**
 * The parents a flattened table writes after a sub-item's title (Notion's
 * « ↑ Parent »).
 *
 * @param props the titles of the parents.
 * @returns the labels.
 */
export function ParentLabels({ titles }: { titles: string[] }) {
  const { t } = useTranslation();
  if (!titles.length) {
    return null;
  }
  return (
    <Parents>
      {titles.map((title, index) => (
        <Parent key={index}>
          <UpArrow size={14} />
          <ParentTitle>{title || t("Untitled")}</ParentTitle>
        </Parent>
      ))}
    </Parents>
  );
}

const Leading = styled.span`
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  margin-inline-end: 2px;
`;

const Toggle = styled.button<{ $expanded: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  color: ${s("textSecondary")};
  cursor: var(--pointer);
  transform: rotate(${(props) => (props.$expanded ? "0deg" : "-90deg")});
  transition: transform 100ms ease;

  svg {
    fill: currentColor;
  }

  &:hover {
    background: ${s("listItemHoverBackground")};
  }
`;

const Placeholder = styled.span`
  display: inline-block;
  width: 20px;
`;

const Parents = styled.span`
  display: inline-flex;
  flex-shrink: 0;
  gap: 6px;
  max-width: 50%;
  margin-inline-start: 6px;
`;

const Parent = styled.span`
  display: inline-flex;
  align-items: center;
  min-width: 0;
  color: ${s("textTertiary")};
  font-size: 12px;
  font-weight: 500;
`;

const UpArrow = styled(ArrowIcon)`
  flex-shrink: 0;
  transform: rotate(-90deg);
  fill: currentColor;
`;

const ParentTitle = styled.span`
  ${ellipsis()}
`;
