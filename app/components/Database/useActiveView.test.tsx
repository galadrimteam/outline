import { observer } from "mobx-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DatabaseView } from "@shared/databases/types";
import { DatabaseLayout } from "@shared/databases/types";
import Storage from "@shared/utils/Storage";
import stores from "~/stores";
import type Database from "~/models/Database";
import { activeViewStorageKey, useActiveView } from "./useActiveView";

const databaseId = "30000000-0000-4000-8000-000000000005";

function makeView(id: string, order: number): DatabaseView {
  return {
    id,
    name: id,
    type: "grid",
    layout: DatabaseLayout.Table,
    order,
    filter: null,
    sort: null,
    group: null,
    columnMeta: {},
    options: {},
    overrides: {},
    isLocked: false,
  };
}

const Harness = observer(function Harness({
  database,
}: {
  database: Database;
}) {
  const { activeView } = useActiveView(database, databaseId, null);
  return <span>{activeView?.id}</span>;
});

describe("useActiveView", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // @ts-expect-error the flag React reads to allow act() outside of its own test utilities.
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Storage.remove(activeViewStorageKey(databaseId));
  });

  it("keeps the shown tab when another one is dragged before it", async () => {
    Storage.set(activeViewStorageKey(databaseId), "deleted");
    const database = stores.databases.add({
      id: databaseId,
      title: "Suivi",
      icon: null,
      collectionId: "40000000-0000-4000-8000-000000000001",
      documentId: null,
      url: `/db/${databaseId}`,
      settings: {},
      fields: [],
      views: [makeView("roadmap", 0), makeView("kanban", 1), makeView("x", 2)],
    });
    await act(async () => {
      root.render(<Harness database={database} />);
    });
    expect(container.textContent).toBe("roadmap");

    await act(async () => {
      database.updateData({
        views: [
          makeView("x", 0),
          makeView("roadmap", 1),
          makeView("kanban", 2),
        ],
      });
    });
    expect(container.textContent).toBe("roadmap");

    await act(async () => {
      database.updateData({
        views: [makeView("x", 0), makeView("kanban", 1)],
      });
    });
    expect(container.textContent).toBe("x");
  });
});
