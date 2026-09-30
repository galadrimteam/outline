import { observer } from "mobx-react";
import { transparentize } from "polished";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import breakpoint from "styled-components-breakpoint";
import { EmojiText } from "@shared/components/EmojiText";
import { EditorStyleHelper } from "@shared/editor/styles/EditorStyleHelper";
import { depths, hideScrollbars, s } from "@shared/styles";
import { useDocumentContents } from "./useDocumentContents";

function Contents() {
  const { items, activeSlug, minLevel, handleClick } = useDocumentContents();
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});

  useEffect(() => {
    const activeItem = activeSlug ? itemRefs.current[activeSlug] : undefined;

    if (activeItem) {
      activeItem.scrollIntoView({
        block: "nearest",
      });
    }
  }, [activeSlug]);

  const headingAdjustment = minLevel - 1;
  const { t } = useTranslation();

  if (items.length === 0) {
    return <StickyWrapper />;
  }

  return (
    <StickyWrapper>
      <Heading>{t("Contents")}</Heading>
      <List>
        {items.map(({ heading, label }) => (
          <ListItem
            key={heading.id}
            ref={(el) => (itemRefs.current[heading.id] = el)}
            level={heading.level - headingAdjustment}
            active={activeSlug === heading.id}
          >
            <Link
              href={`#${heading.id}`}
              onClick={(event) => handleClick(event, heading.id)}
            >
              {label && <Prefix>{label}</Prefix>}
              <EmojiText>{heading.title}</EmojiText>
            </Link>
          </ListItem>
        ))}
      </List>
    </StickyWrapper>
  );
}

const StickyWrapper = styled.div`
  display: none;
  position: sticky;
  top: 90px;
  max-height: calc(100vh - 90px);
  width: ${EditorStyleHelper.tocWidth}px;

  ${hideScrollbars()}

  padding: 0 16px;
  overflow-y: auto;
  border-radius: 8px;
  background: ${s("background")};

  @supports (backdrop-filter: blur(20px)) {
    backdrop-filter: blur(20px);
    background: ${(props) => transparentize(0.2, props.theme.background)};
  }

  ${breakpoint("tablet")`
    display: block;
    z-index: ${depths.toc};
  `};
`;

const Heading = styled.h3`
  font-size: 13px;
  font-weight: 600;
  color: ${s("textTertiary")};
  letter-spacing: 0.03em;
  margin-top: 10px;
`;

const Prefix = styled.span`
  color: ${s("textSecondary")};
  margin-inline-end: 0.25em;
  user-select: none;
`;

const ListItem = styled.li<{ level: number; active?: boolean }>`
  margin-left: ${(props) => (props.level - 1) * 10}px;
  margin-bottom: 8px;
  line-height: 1.3;
  word-break: break-word;

  a {
    font-weight: ${(props) => (props.active ? "600" : "inherit")};
    color: ${(props) => (props.active ? props.theme.accent : props.theme.text)};

    ${Prefix} {
      color: ${(props) =>
        props.active ? props.theme.accent : props.theme.textSecondary};
    }
  }
`;

const Link = styled.a`
  color: ${s("text")};
  font-size: 14px;

  &:hover {
    color: ${s("accent")};
  }
`;

const List = styled.ol`
  padding: 0;
  list-style: none;
`;

export default observer(Contents);
