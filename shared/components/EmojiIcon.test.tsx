import { renderToString } from "react-dom/server";
import EmojiIcon from "./EmojiIcon";

function fontSizeOf(html: string): number {
  const match = /font-size="([\d.]+)"/.exec(html);
  return match ? Number(match[1]) : NaN;
}

describe("EmojiIcon", () => {
  it("draws the emoji at the size of a standard icon by default", () => {
    const html = renderToString(<EmojiIcon emoji="🎯" size={78} />);
    expect(fontSizeOf(html)).toBeCloseTo(78 * 0.7);
  });

  it("draws the emoji across the whole box when full size, like a Notion page icon", () => {
    const html = renderToString(<EmojiIcon emoji="🎯" size={78} fullSize />);
    expect(fontSizeOf(html)).toBe(78);
    expect(html).toContain('overflow="visible"');
  });
});
