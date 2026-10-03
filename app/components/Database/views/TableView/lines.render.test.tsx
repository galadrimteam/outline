import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "styled-components";
import { light } from "@shared/styles/theme";
import {
  Cell,
  HeaderCell,
  HeaderLine,
  OpenLine,
  RowLine,
  Scroller,
  SpanningLine,
} from "./styles";
import { BLEED_VARIABLE } from "../bleed";

/** The declarations of the style rules that target a pseudo-element of an element, in order. */
function pseudoRules(element: Element, pseudo: "::before" | "::after") {
  const classes = Array.from(element.classList);
  const found: CSSStyleDeclaration[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (
        rule instanceof CSSStyleRule &&
        rule.selectorText.endsWith(pseudo) &&
        classes.some((name) => rule.selectorText.includes(`.${name}`))
      ) {
        found.push(rule.style);
      }
    }
  }
  return found;
}

const lastValue = (rules: CSSStyleDeclaration[], property: string) =>
  rules
    .map((rule) => rule.getPropertyValue(property))
    .filter(Boolean)
    .pop();

describe("table lines", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render() {
    act(() =>
      root.render(
        <ThemeProvider theme={light}>
          <HeaderLine $template="24px 200px 120px" data-testid="header">
            <span />
            <HeaderCell $frozen $left={24} data-testid="header-title">
              Ticket
            </HeaderCell>
            <HeaderCell data-testid="header-epic">Epic</HeaderCell>
          </HeaderLine>
          <RowLine $template="24px 200px 120px" data-testid="row">
            <span />
            <Cell $frozen $left={24} data-testid="title">
              ETQU
            </Cell>
            <Cell data-testid="epic">Contrôles</Cell>
          </RowLine>
          <SpanningLine $template="24px 1fr" data-testid="add-in-group" />
          <OpenLine $template="24px 1fr" data-testid="add" />
          <Scroller data-testid="scroller" />
        </ThemeProvider>
      )
    );
  }

  const byTestId = (id: string) => {
    const element = container.querySelector(`[data-testid='${id}']`);
    if (!element) {
      throw new Error(`no ${id}`);
    }
    return element;
  };

  it("runs the rule of a row over its frozen title cell, as in Notion", () => {
    render();
    const line = pseudoRules(byTestId("row"), "::after");
    expect(lastValue(line, "border-bottom")).toBeTruthy();
    expect(Number(lastValue(line, "z-index"))).toBeGreaterThanOrEqual(
      Number(getComputedStyle(byTestId("title")).zIndex)
    );
  });

  it("separates body cells only, with no rule above the headers", () => {
    render();
    expect(getComputedStyle(byTestId("title")).borderRightStyle).toBe("solid");
    expect(getComputedStyle(byTestId("epic")).borderRightStyle).toBe("solid");
    expect(
      getComputedStyle(byTestId("header-title")).borderRightStyle
    ).not.toBe("solid");
    expect(getComputedStyle(byTestId("header-epic")).borderRightStyle).not.toBe(
      "solid"
    );
    expect(pseudoRules(byTestId("header"), "::before")).toEqual([]);
    expect(
      lastValue(pseudoRules(byTestId("header"), "::after"), "z-index")
    ).toBe("2");
  });

  it("draws no rule under the « + New page » that ends a table", () => {
    render();
    expect(lastValue(pseudoRules(byTestId("add"), "::after"), "display")).toBe(
      "none"
    );
    expect(
      lastValue(pseudoRules(byTestId("add-in-group"), "::after"), "display")
    ).toBeUndefined();
  });

  it("lets the table run right of the text column into the room its block gives", () => {
    render();
    const style = getComputedStyle(byTestId("scroller"));
    expect(style.getPropertyValue("margin-inline-end")).toContain(
      `var(${BLEED_VARIABLE}`
    );
    expect(style.getPropertyValue("padding-inline-end")).toContain(
      `var(${BLEED_VARIABLE}`
    );
  });
});
