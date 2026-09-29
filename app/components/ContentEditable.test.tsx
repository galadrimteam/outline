import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ContentEditable from "./ContentEditable";

describe("ContentEditable", () => {
  let container: HTMLDivElement;
  let root: Root;
  let onChange: ReturnType<typeof vi.fn<(text: string) => void>>;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    onChange = vi.fn<(text: string) => void>();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(value: string, syncWhileFocused: boolean) {
    act(() =>
      root.render(
        <ContentEditable
          value={value}
          onChange={onChange}
          syncWhileFocused={syncWhileFocused}
          tabIndex={0}
        />
      )
    );
    const element = container.querySelector("span");
    if (!element) {
      throw new Error("no editable element");
    }
    return element;
  }

  function blur(element: HTMLElement) {
    act(() => element.blur());
  }

  it("shows a value changed elsewhere while focused, and never sends the old text back", () => {
    const element = render("Old title", true);
    act(() => element.focus());

    render("New title", true);
    expect(element.textContent).toBe("New title");

    blur(element);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still sends what is typed after a value changed elsewhere", () => {
    const element = render("Old title", true);
    act(() => element.focus());
    render("New title", true);

    element.textContent = "New title!";
    act(() => {
      element.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith("New title!");
  });

  it("keeps the typed text by default, and sends it on blur", () => {
    const element = render("Old title", false);
    act(() => element.focus());

    render("New title", false);
    expect(element.textContent).toBe("Old title");

    blur(element);
    expect(onChange).toHaveBeenCalledWith("Old title");
  });
});
