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
 *
 * @param count the number of items.
 * @param onPick called with the index of the picked item.
 * @returns the highlighted index, its setter and the search box key handler.
 */
export function useListNavigation(
  count: number,
  onPick: (index: number) => void
) {
  const [highlighted, setActive] = React.useState(0);
  const active = Math.min(highlighted, Math.max(count - 1, 0));

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive(count ? (active + 1) % count : 0);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive(count ? (active - 1 + count) % count : 0);
        return;
      }
      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
        event.preventDefault();
        if (count) {
          onPick(active);
        }
      }
    },
    [active, count, onPick]
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
 * Stops a click from reaching the cell host, for links and buttons drawn inside a cell.
 *
 * @param event the click.
 */
export function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}
