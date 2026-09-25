import { StarredIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";
import { toneColors } from "../colors";
import { EmptyValue } from "./components/styles";
import { isWritable } from "./editable";
import type {
  CellDefinition,
  CellEditorProps,
  CellRendererProps,
} from "./types";

/** A rating: a row of stars out of the field's maximum. */
export const ratingCell: CellDefinition = {
  Renderer: RatingRenderer,
  Editor: RatingEditor,
  isEditable: isWritable,
};

function RatingRenderer({ field, value, variant }: CellRendererProps) {
  const { t } = useTranslation();
  const rating = typeof value === "number" ? value : 0;

  if (!rating) {
    return variant === "property" ? (
      <EmptyValue>{t("Empty")}</EmptyValue>
    ) : null;
  }

  return <Stars field={field} rating={rating} />;
}

function RatingEditor({ field, value, onChange, onClose }: CellEditorProps) {
  const { t } = useTranslation();
  const rating = typeof value === "number" ? value : 0;
  const [hovered, setHovered] = React.useState<number>();

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div
      role="radiogroup"
      aria-label={t("Rating")}
      tabIndex={-1}
      ref={(element) => element?.focus()}
      onKeyDown={handleKeyDown}
      onBlur={onClose}
      onMouseLeave={() => setHovered(undefined)}
    >
      <Stars
        field={field}
        rating={hovered ?? rating}
        onHover={setHovered}
        onPick={(picked) => {
          onChange(picked === rating ? null : picked);
          onClose();
        }}
      />
    </div>
  );
}

function Stars({
  field,
  rating,
  onHover,
  onPick,
}: {
  field: CellRendererProps["field"];
  rating: number;
  onHover?: (value: number) => void;
  onPick?: (value: number) => void;
}) {
  const theme = useTheme();
  const max = Math.min(Math.max(field.options.max ?? 5, 1), 10);
  const filled = toneColors(field.options.color ?? "yellow", theme).dot;

  return (
    <Row>
      {Array.from({ length: max }, (_, index) => {
        const star = index + 1;
        return (
          <Star
            key={star}
            role={onPick ? "radio" : undefined}
            aria-checked={onPick ? star === rating : undefined}
            aria-label={onPick ? String(star) : undefined}
            style={{ color: star <= rating ? filled : theme.divider }}
            $interactive={!!onPick}
            onMouseEnter={() => onHover?.(star)}
            onMouseDown={(event) => {
              if (onPick) {
                event.preventDefault();
                onPick(star);
              }
            }}
          >
            <StarredIcon size={18} color="currentColor" />
          </Star>
        );
      })}
    </Row>
  );
}

const Row = styled.span`
  display: inline-flex;
  align-items: center;
`;

const Star = styled.span<{ $interactive: boolean }>`
  display: inline-flex;
  margin-right: -2px;
  cursor: ${(props) => (props.$interactive ? "var(--pointer)" : "inherit")};
`;
