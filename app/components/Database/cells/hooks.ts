import * as React from "react";
import { unicodeCLDRtoBCP47 } from "@shared/utils/date";
import useUserLocale from "~/hooks/useUserLocale";

/**
 * The reader's locale as a BCP 47 tag ("fr-FR"), for `Intl` formatting of cells.
 *
 * @returns the locale, or undefined for the browser's.
 */
export function useCellLocale(): string | undefined {
  const language = useUserLocale();
  return language ? unicodeCLDRtoBCP47(language) : undefined;
}

/**
 * Calls `commit` with the latest draft when the editor unmounts, whatever closed it (Enter, Tab,
 * click elsewhere): editors of typed values save like Notion's, without an explicit button.
 *
 * @param draft the value being typed.
 * @param commit saves the draft; it should ignore an unchanged draft.
 */
export function useCommitOnUnmount<T>(draft: T, commit: (draft: T) => void) {
  const latest = React.useRef({ draft, commit });

  React.useLayoutEffect(() => {
    latest.current = { draft, commit };
  });

  React.useEffect(
    () => () => {
      latest.current.commit(latest.current.draft);
    },
    []
  );
}

/**
 * Keyboard highlight of a popover list driven from its search box: arrows move, Enter picks.
 * Given the search text, the list starts with nothing highlighted and a first Enter picks
 * nothing, like Notion's pickers: typing highlights the first match, arrows move from there.
 * Without it, the first item is highlighted from the start. A held Enter never repeats a pick.
 *
 * @param count the number of items.
 * @param onPick called with the index of the picked item.
 * @param search the search text, and what Enter does when nothing is highlighted.
 * @returns the highlighted index (-1 for none), its setter and the search box key handler.
 */
export function useListNavigation(
  count: number,
  onPick: (index: number) => void,
  search?: { query: string; onEnterWithoutPick?: () => void }
) {
  const query = search?.query;
  const [highlighted, setActive] = React.useState(search && !query ? -1 : 0);
  const [queried, setQueried] = React.useState(query);
  if (query !== queried) {
    setQueried(query);
    setActive(query ? 0 : -1);
  }
  const active =
    highlighted < 0 ? -1 : Math.min(highlighted, Math.max(count - 1, 0));
  const onEnterWithoutPick = search?.onEnterWithoutPick;

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive(count ? (active + 1) % count : 0);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive(count ? (Math.max(active, 0) - 1 + count) % count : 0);
        return;
      }
      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        if (count && active >= 0) {
          onPick(active);
          return;
        }
        onEnterWithoutPick?.();
      }
    },
    [active, count, onEnterWithoutPick, onPick]
  );

  return { active, setActive, handleKeyDown };
}

/**
 * A value that follows another one after it stopped changing for `delay` milliseconds, for
 * searches sent to the server while typing.
 *
 * @param value the changing value.
 * @param delay the quiet time in milliseconds.
 * @returns the settled value.
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [settled, setSettled] = React.useState(value);

  React.useEffect(() => {
    const timeout = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return settled;
}

/**
 * Puts the caret after the text of a field that gets the focus, for editors opened with what
 * the reader already typed.
 *
 * @param event the focus event.
 */
export function moveCaretToEnd(
  event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
) {
  const length = event.target.value.length;
  event.target.setSelectionRange(length, length);
}

/**
 * Stops a click from reaching the cell host, for links and buttons drawn inside a cell.
 *
 * @param event the click.
 */
export function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}
