import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ShareContext } from "@shared/hooks/useShare";
import type { DatabaseShare } from "./useDatabaseShare";
import { useDatabaseShare } from "./useDatabaseShare";

const seen: { current?: DatabaseShare } = {};

function Probe() {
  const share = useDatabaseShare();
  useEffect(() => {
    seen.current = share;
  });
  return null;
}

describe("useDatabaseShare", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    seen.current = undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("lets the reader's rights decide in the app", () => {
    act(() => root.render(<Probe />));

    expect(seen.current).toMatchObject({
      shareId: undefined,
      isShare: false,
      readOnly: false,
      canOpenInSplit: true,
      canLinkToDatabase: true,
    });
    expect(seen.current?.rowPath("/doc/carte-abc123")).toEqual(
      "/doc/carte-abc123"
    );
  });

  it("makes the block read-only and keeps row pages in the share", () => {
    act(() =>
      root.render(
        <ShareContext.Provider value={{ shareId: "projet-client" }}>
          <Probe />
        </ShareContext.Provider>
      )
    );

    expect(seen.current).toMatchObject({
      shareId: "projet-client",
      isShare: true,
      readOnly: true,
      canOpenInSplit: false,
      canLinkToDatabase: false,
    });
    expect(seen.current?.rowPath("/doc/carte-abc123")).toEqual(
      "/s/projet-client/doc/carte-abc123"
    );
  });
});
