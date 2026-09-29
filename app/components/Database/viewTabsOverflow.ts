/** The sizes the view tab strip is laid out from, in pixels. */
export interface TabStripMetrics {
  /** The width of each tab, in tab order. */
  widths: number[];
  /** The width the tabs, the « N more » button and « + » share. */
  available: number;
  /** The space between two items of the strip. */
  gap: number;
  /** The width of the « N more » button. */
  moreWidth: number;
  /** The width of the « + » button, 0 when it is not shown. */
  addWidth: number;
}

/** Which tabs the strip draws and which ones it lists under « N more ». */
export interface TabStripSplit {
  /** Indexes of the tabs drawn in the strip, in tab order. */
  visible: number[];
  /** Indexes of the tabs listed in the « N more » menu, in tab order. */
  hidden: number[];
}

/**
 * Splits the view tabs between the strip and the « N more » menu, like
 * Notion: the first tabs that fit stay, « N more » and « + » always keep
 * their room, and the active tab is always drawn, in place of the last tabs
 * that fit when it is further on.
 *
 * @param metrics the widths of the tabs, buttons and room.
 * @param activeIndex the index of the active tab, -1 when none.
 * @returns the drawn and the listed tabs.
 */
export function splitTabs(
  metrics: TabStripMetrics,
  activeIndex: number
): TabStripSplit {
  const { widths, available, gap, moreWidth, addWidth } = metrics;
  const all = widths.map((_width, index) => index);
  const span = (indexes: number[]) =>
    indexes.reduce((total, index) => total + widths[index], 0) +
    gap * Math.max(indexes.length - 1, 0);
  const addRoom = addWidth > 0 ? addWidth + gap : 0;

  if (!all.length || span(all) + addRoom <= available) {
    return { visible: all, hidden: [] };
  }

  const reserved = addRoom + moreWidth + gap;
  const fits = (indexes: number[]) => span(indexes) + reserved <= available;
  let visible: number[] = [];
  for (const index of all) {
    if (!fits([...visible, index])) {
      break;
    }
    visible.push(index);
  }

  const active = widths[activeIndex] !== undefined ? activeIndex : -1;
  if (active >= 0 && !visible.includes(active)) {
    while (visible.length && !fits([...visible, active])) {
      visible = visible.slice(0, -1);
    }
    visible = [...visible, active];
  }
  if (!visible.length) {
    visible = [Math.max(active, 0)];
  }

  return {
    visible,
    hidden: all.filter((index) => !visible.includes(index)),
  };
}

/**
 * The narrowest the strip may get: the active tab (the first one when none
 * is active), « N more » when some tab can be listed there, and « + ». The
 * toolbar goes to its own line rather than squeeze the strip below this.
 *
 * @param metrics the widths of the tabs and buttons.
 * @param activeIndex the index of the active tab, -1 when none.
 * @returns the width in pixels, 0 without tabs.
 */
export function stripMinimum(
  metrics: TabStripMetrics,
  activeIndex: number
): number {
  const { widths, gap, moreWidth, addWidth } = metrics;
  const tab = widths[activeIndex] ?? widths[0] ?? 0;
  const more = widths.length > 1 ? gap + moreWidth : 0;
  const add = addWidth > 0 ? gap + addWidth : 0;
  return Math.ceil(tab + more + add);
}
