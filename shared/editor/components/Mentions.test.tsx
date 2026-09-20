import { Provider } from "mobx-react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps } from "../types";
import { documentMentionLabel, MentionDocument } from "./Mentions";

describe("documentMentionLabel", () => {
  it("prefers the stored label over the live title", () => {
    // galadrim: our importer writes the author's own sentence text as the
    // label, e.g. "the project is [Add a project to Gatus]" mid-sentence,
    // which is not the title of the page it links to.
    expect(documentMentionLabel("Add a project to Gatus", "Gatus")).toBe(
      "Add a project to Gatus"
    );
  });

  it("falls back to the live title when there is no stored label", () => {
    expect(documentMentionLabel(undefined, "Gatus")).toBe("Gatus");
    expect(documentMentionLabel("", "Gatus")).toBe("Gatus");
  });

  it("returns undefined when neither is available yet", () => {
    expect(documentMentionLabel(undefined, undefined)).toBeUndefined();
  });

  it("is unaffected when the label happens to equal the title", () => {
    expect(documentMentionLabel("Gatus", "Gatus")).toBe("Gatus");
  });
});

/**
 * Renders a document mention the way a reader sees it, with the target
 * document either loaded in the store under the given title or not loaded at
 * all, and returns the markup.
 */
function renderMention(label: string | undefined, title: string | undefined) {
  const node = {
    attrs: { modelId: "doc-1", label, anchorId: null },
    type: { spec: { toDOM: () => ["span", { class: "mention" }] } },
  };
  const rootStore = {
    documents: {
      get: () => (title ? { title, path: "/doc/target" } : undefined),
      prefetchDocument: () => undefined,
    },
  };

  return renderToStaticMarkup(
    <Provider rootStore={rootStore}>
      <MemoryRouter>
        <MentionDocument
          {...({ node, isSelected: false } as unknown as ComponentProps)}
        />
      </MemoryRouter>
    </Provider>
  );
}

describe("MentionDocument", () => {
  it("shows the author's own words, not the title of the target", () => {
    // Reading the rendered text rather than the helper alone: this is what
    // catches the two arguments of documentMentionLabel being swapped back at
    // the call site.
    const markup = renderMention("Add a project to Gatus", "Gatus");

    expect(markup).toContain("Add a project to Gatus");
    expect(markup).not.toContain(">Gatus<");
  });

  it("shows the title of the target when the mention carries no words", () => {
    expect(renderMention(undefined, "Gatus")).toContain("Gatus");
  });
});
