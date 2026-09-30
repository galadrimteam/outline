import { useState, useEffect, useMemo, useCallback } from "react";
import { useHistory } from "react-router-dom";
import { HeadingPrefixHelper } from "@shared/editor/extensions/HeadingPrefix";
import { DocumentPreference, HeadingPrefixStyle } from "@shared/types";
import type { Heading } from "@shared/utils/ProsemirrorHelper";
import { supportsPassiveListener } from "@shared/utils/browser";
import { useDocumentContext } from "~/components/DocumentContext";
import useWindowScrollPosition from "~/hooks/useWindowScrollPosition";
import { patchLocation } from "~/utils/history";
import { decodeURIComponentSafe } from "~/utils/urls";

/** A heading listed in the contents of a document. */
export interface ContentsItem {
  heading: Heading;
  /** Its number, when the document numbers its headings. */
  label?: string;
}

/** The contents of the open document, and the heading the reader is at. */
export interface DocumentContents {
  items: ContentsItem[];
  /** The id of the heading the reader scrolled to or chose. */
  activeSlug: string | undefined;
  /** The shallowest level listed, to indent the others from. */
  minLevel: number;
  /** Scrolls to a heading when its link is clicked. */
  handleClick: (event: React.MouseEvent<HTMLAnchorElement>, id: string) => void;
}

const HEADING_OFFSET = 20;

/** Headings deeper than this level are not listed in the contents. */
const MAX_HEADING_LEVEL = 4;

/**
 * The headings of the open document as its contents list them, with the one the reader is at,
 * shared by the contents panel and the rail in the margin.
 *
 * @returns the contents.
 */
export function useDocumentContents(): DocumentContents {
  const history = useHistory();
  const [scrolledSlug, setScrolledSlug] = useState<string>();
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const scrollPosition = useWindowScrollPosition({
    throttle: 100,
  });
  const documentContext = useDocumentContext();
  const headings = useMemo(
    () => documentContext.headings.filter((heading) => !heading.inTable),
    [documentContext.headings]
  );

  const headingPrefix =
    documentContext.document?.getPreference(DocumentPreference.HeadingPrefix) ??
    HeadingPrefixStyle.None;

  const items = useMemo(() => {
    const labels =
      headingPrefix === HeadingPrefixStyle.None
        ? undefined
        : HeadingPrefixHelper.labels(
            headings.map((heading) => heading.level),
            headingPrefix,
            { indented: true }
          );

    return headings
      .map((heading, index) => ({ heading, label: labels?.[index] }))
      .filter(({ heading }) => heading.level <= MAX_HEADING_LEVEL);
  }, [headings, headingPrefix]);

  const activeSlug =
    selectedSlug && items.some(({ heading }) => heading.id === selectedSlug)
      ? selectedSlug
      : scrolledSlug;

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      setSelectedSlug(id);
      history.push(patchLocation(history.location, { hash: `#${id}` }));

      void documentContext.editor?.scrollToAnchor(`#${id}`);
    },
    [history, documentContext]
  );

  useEffect(() => {
    if (!selectedSlug) {
      return;
    }

    const restingPosition = window.pageYOffset;

    const handleScroll = () => {
      if (window.pageYOffset !== restingPosition) {
        setSelectedSlug(undefined);
      }
    };

    window.addEventListener(
      "scroll",
      handleScroll,
      supportsPassiveListener ? { passive: true } : false
    );

    return () => window.removeEventListener("scroll", handleScroll);
  }, [selectedSlug]);

  useEffect(() => {
    let activeId = items.length > 0 ? items[0].heading.id : undefined;

    for (const { heading } of items) {
      const element = window.document.getElementById(
        decodeURIComponentSafe(heading.id)
      );

      if (element) {
        const bounding = element.getBoundingClientRect();
        if (bounding.top > HEADING_OFFSET) {
          break;
        }
        activeId = heading.id;
      }
    }

    if (scrolledSlug !== activeId) {
      setScrolledSlug(activeId);
    }
  }, [scrollPosition, items, scrolledSlug]);

  const minLevel = items.reduce(
    (memo, { heading }) => (heading.level < memo ? heading.level : memo),
    Infinity
  );

  return { items, activeSlug, minLevel, handleClick };
}
