import { renderToStaticMarkup } from "react-dom/server";
import embeds from "../embeds";
import type { ComponentProps } from "../types";
import Embed from "./Embed";

/**
 * Renders the embed node for a URL the way a reader sees it, and returns the
 * markup. The iframe itself only mounts in an effect, so what comes back is
 * everything around it – which is the point here: what is left when the
 * framed site does not load.
 */
function render(href: string) {
  const props = {
    node: { attrs: { href } },
    isSelected: false,
    isEditable: false,
  } as unknown as ComponentProps;

  return renderToStaticMarkup(<Embed {...props} embeds={embeds} />);
}

describe("Embed", () => {
  it("offers a link to the source of an embed no provider recognises", () => {
    // galadrim: our importer turns a link alone on its line into an embed, as
    // Notion does. github.com and the like refuse to be framed, so without
    // this link out the reader would be left with an empty rectangle and no
    // hint of what it was – strictly worse than the bare link.
    const href = "https://github.com/outline/outline";
    const markup = render(href);

    expect(markup).toContain(`href="${href}"`);
    expect(markup).toContain("Open");
  });

  it("still lets a recognised provider hide its bar", () => {
    // Tella embeds carry a footer of their own, so ours stays hidden.
    const markup = render("https://www.tella.tv/video/abc123");

    expect(markup).not.toContain("Open");
  });
});
