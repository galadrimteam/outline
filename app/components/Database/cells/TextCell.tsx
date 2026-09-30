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

function TextEditor({
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
