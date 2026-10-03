import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import { DateMentionText } from "~/components/DateMentionText";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "~/components/primitives/Popover";
import {
  CellLink,
  CellText,
  EmptyValue,
  InlineInput,
} from "./components/styles";
import { isWritable } from "./editable";
import { cellValueToText, hrefForText, shortUrl } from "./format";
import {
  moveCaretToEnd,
  stopPropagation,
  useCellLocale,
  useCommitOnUnmount,
} from "./hooks";
import type {
  CellDefinition,
  CellEditorProps,
  CellRendererProps,
} from "./types";

/** Single line text, shown as a link when the field shows its text as URL, e-mail or phone. */
export const textCell: CellDefinition = {
  Renderer: TextRenderer,
  Editor: TextEditor,
  isEditable: isWritable,
  opensOnTyping: true,
};

/** Multi-line text. */
export const longTextCell: CellDefinition = {
  Renderer: TextRenderer,
  Editor: LongTextEditor,
  isEditable: isWritable,
  opensOnTyping: true,
};

function TextRenderer({ field, value, variant, wrap }: CellRendererProps) {
  const { t } = useTranslation();
  const locale = useCellLocale();
  const text =
    typeof value === "string" ? value : cellValueToText(field, value, locale);

  if (!text.trim()) {
    return variant === "property" ? (
      <EmptyValue>{t("Empty")}</EmptyValue>
    ) : null;
  }

  const href = hrefForText(text, field.options.showAs?.type);
  if (href) {
    const short =
      variant === "property" && field.options.showAs?.type === "url"
        ? shortUrl(href)
        : undefined;
    return (
      <CellLink
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={short ? text : undefined}
        $variant={variant}
        $wrap={wrap}
        onClick={stopPropagation}
      >
        {short ? (
          <>
            {short.host}
            <UrlRest>{short.rest}</UrlRest>
          </>
        ) : (
          text
        )}
      </CellLink>
    );
  }

  return (
    <CellText $variant={variant} $wrap={wrap}>
      {field.isPrimary ? <DateMentionText text={text} /> : text}
    </CellText>
  );
}

function TextEditor(props: CellEditorProps) {
  return props.variant === "table" ? (
    <TableTextEditor {...props} />
  ) : (
    <InlineTextEditor {...props} />
  );
}

function InlineTextEditor({
  value,
  onChange,
  onClose,
  initialInput,
}: CellEditorProps) {
  const initial = typeof value === "string" ? value : "";
  const [draft, setDraft] = React.useState(initialInput ?? initial);

  useCommitOnUnmount(draft, (text) => {
    if (text !== initial) {
      onChange(text === "" ? null : text);
    }
  });

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setDraft(event.target.value),
    []
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  return (
    <InlineInput
      autoFocus
      value={draft}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={onClose}
      onFocus={moveCaretToEnd}
    />
  );
}

/**
 * Edits the text of a table cell in a box laid over the cell, as Notion does: the whole text
 * wraps in it and the box grows down over the next rows, while the cell keeps its single line.
 * The text stays on one line: Enter ends editing.
 *
 * @param props the cell and the write callbacks.
 * @returns the cell's text and the box over it.
 */
function TableTextEditor(props: CellEditorProps) {
  const { field, value, onChange, onClose, initialInput } = props;
  const { t } = useTranslation();
  const cellRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const initial = typeof value === "string" ? value : "";
  const [draft, setDraft] = React.useState(initialInput ?? initial);
  const [cellSize, setCellSize] = React.useState({ width: 0, height: 0 });

  useCommitOnUnmount(draft, (text) => {
    if (text !== initial) {
      onChange(text === "" ? null : text);
    }
  });

  React.useLayoutEffect(() => {
    const cell = cellRef.current;
    if (cell) {
      setCellSize({ width: cell.offsetWidth, height: cell.offsetHeight });
    }
  }, []);

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft, cellSize.width]);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) =>
      setDraft(event.target.value.replace(/\r?\n/g, " ")),
    []
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  const handleCloseAutoFocus = React.useCallback(
    (event: Event) => event.preventDefault(),
    []
  );

  // The box covers the cell and its borders, its text where the cell's was.
  return (
    <Popover open onOpenChange={handleOpenChange}>
      <TextRenderer {...props} />
      <PopoverAnchor asChild>
        <CellArea ref={cellRef} />
      </PopoverAnchor>
      <CellOverlay
        aria-label={t("Edit text")}
        side="bottom"
        align="start"
        sideOffset={-cellSize.height - 1}
        alignOffset={-1}
        width={Math.max(cellSize.width + 1, 180)}
        minHeight={cellSize.height + 2}
        scrollable={false}
        onCloseAutoFocus={handleCloseAutoFocus}
        $title={field.isPrimary}
      >
        <OverlayTextarea
          ref={textareaRef}
          autoFocus
          rows={1}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={moveCaretToEnd}
        />
      </CellOverlay>
    </Popover>
  );
}

function LongTextEditor(props: CellEditorProps) {
  const { value, onChange, onClose, initialInput } = props;
  const { t } = useTranslation();
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const initial = typeof value === "string" ? value : "";
  const [draft, setDraft] = React.useState(initialInput ?? initial);
  const [anchorSize, setAnchorSize] = React.useState({ width: 0, height: 0 });

  useCommitOnUnmount(draft, (text) => {
    if (text !== initial) {
      onChange(text === "" ? null : text);
    }
  });

  React.useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (anchor) {
      setAnchorSize({ width: anchor.offsetWidth, height: anchor.offsetHeight });
    }
  }, []);

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft]);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) =>
      setDraft(event.target.value),
    []
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }
      if (
        event.key === "Escape" ||
        (event.key === "Enter" && !event.shiftKey)
      ) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  const handleCloseAutoFocus = React.useCallback(
    (event: Event) => event.preventDefault(),
    []
  );

  return (
    <Popover open onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <div ref={anchorRef}>
          <TextRenderer {...props} />
        </div>
      </PopoverAnchor>
      <OverlayContent
        aria-label={t("Edit text")}
        side="bottom"
        align="start"
        sideOffset={-anchorSize.height}
        width={Math.max(anchorSize.width, 320)}
        shrink
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <Textarea
          ref={textareaRef}
          autoFocus
          rows={3}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={moveCaretToEnd}
        />
      </OverlayContent>
    </Popover>
  );
}

const OverlayContent = styled(PopoverContent)`
  padding: 8px;
`;

const CellArea = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
`;

const CellOverlay = styled(PopoverContent)<{ $title: boolean }>`
  padding: 8px 9px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: ${(props) => (props.$title ? 500 : 400)};
  line-height: 21px;

  &[data-state="open"] {
    animation: none;
  }
`;

const OverlayTextarea = styled.textarea`
  display: block;
  width: 100%;
  border: 0;
  outline: none;
  resize: none;
  overflow: hidden;
  padding: 0;
  margin: 0;
  font: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: ${s("text")};
  background: transparent;
`;

const Textarea = styled.textarea`
  display: block;
  width: 100%;
  min-height: 60px;
  max-height: 50vh;
  border: 0;
  outline: none;
  resize: none;
  padding: 0;
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  color: ${s("text")};
  background: transparent;
`;

const UrlRest = styled.span`
  color: ${s("textTertiary")};
`;
