import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import breakpoint from "styled-components-breakpoint";
import { EmojiText } from "@shared/components/EmojiText";
import { depths, s } from "@shared/styles";
import { announceContentsChange } from "~/components/Database/rightBleed";
import { useSplitView } from "~/components/SplitView/context";
import useStores from "~/hooks/useStores";
import { useDocumentContents } from "./useDocumentContents";

/** A document shows the rail from this many headings on. */
const MIN_HEADINGS = 2;

/**
 * Notion's table of contents in the right margin: one dash per heading, the one the reader is at
 * darker, and the titles on hover. Shown on wide screens while the contents panel and the right
 * sidebar are closed.
 *
 * @returns the rail, or nothing when the document has too few headings.
 */
function ContentsRail() {
  const { t } = useTranslation();
  const { ui } = useStores();
  const { pane, isSplitView } = useSplitView();
  const { items, activeSlug, minLevel, handleClick } = useDocumentContents();

  // The margin it sits in belongs to the right sidebar or the other pane then.
  const isShown =
    items.length >= MIN_HEADINGS && !isSplitView && !ui.getRightSidebar(pane);

  React.useEffect(() => {
    if (!isShown) {
      return;
    }
    announceContentsChange();
    return announceContentsChange;
  }, [isShown]);

  if (!isShown) {
    return null;
  }

  return (
    <Rail aria-label={t("Contents")} data-document-contents>
      <Dashes aria-hidden>
        {items.map(({ heading }) => (
          <Dash
            key={heading.id}
            $depth={heading.level - minLevel}
            $active={heading.id === activeSlug}
          />
        ))}
      </Dashes>
      <Panel>
        {items.map(({ heading, label }) => (
          <Item
            key={heading.id}
            href={`#${heading.id}`}
            $depth={heading.level - minLevel}
            $active={heading.id === activeSlug}
            onClick={(event) => handleClick(event, heading.id)}
          >
            {label && <span>{label} </span>}
            <EmojiText>{heading.title}</EmojiText>
          </Item>
        ))}
      </Panel>
    </Rail>
  );
}

const Panel = styled.div`
  position: absolute;
  top: -12px;
  right: 0;
  width: 260px;
  max-height: 70vh;
  overflow-y: auto;
  padding: 8px;
  border-radius: 8px;
  background: ${s("menuBackground")};
  box-shadow: ${s("menuShadow")};
  opacity: 0;
  visibility: hidden;
  transform: translateX(8px);
  transition:
    opacity 100ms ease,
    transform 100ms ease,
    visibility 100ms;
`;

const Rail = styled.nav`
  display: none;
  position: fixed;
  top: 30vh;
  right: 20px;
  z-index: ${depths.toc};

  ${breakpoint("desktop")`
    display: block;
  `};

  &:hover ${Panel}, &:focus-within ${Panel} {
    opacity: 1;
    visibility: visible;
    transform: none;
  }

  @media print {
    display: none;
  }
`;

const Dashes = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  padding: 4px 0;
`;

const Dash = styled.span<{ $depth: number; $active: boolean }>`
  display: block;
  height: 2px;
  width: ${(props) => Math.max(16 - props.$depth * 4, 8)}px;
  border-radius: 1px;
  background: ${(props) =>
    props.$active ? props.theme.text : props.theme.divider};
`;

const Item = styled.a<{ $depth: number; $active: boolean }>`
  display: block;
  padding: 4px 8px 4px ${(props) => 8 + props.$depth * 12}px;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1.4;
  color: ${(props) =>
    props.$active ? props.theme.text : props.theme.textSecondary};
  font-weight: ${(props) => (props.$active ? 500 : 400)};

  &:hover {
    color: ${s("text")};
    background: ${s("listItemHoverBackground")};
  }
`;

export default observer(ContentsRail);
