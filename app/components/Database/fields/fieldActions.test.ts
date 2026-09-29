import { vi } from "vitest";
import { DatabaseFieldType } from "@shared/databases/types";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";
import { makeField, makeView } from "../views/TableView/testFixtures";
import { fieldHasValues } from "./fieldActions";

const databaseId = "30000000-0000-4000-8000-000000000010";

describe("fieldHasValues", () => {
  const database = () =>
    stores.databases.add({
      id: databaseId,
      title: "Suivi",
      icon: null,
      collectionId: "40000000-0000-4000-8000-000000000010",
      documentId: null,
      url: `/db/${databaseId}`,
      settings: {},
      fields: [makeField({ id: "status" })],
      views: [
        makeView({ id: "viwSecond", order: 1 }),
        makeView({ id: "viwFirst" }),
      ],
    });

  beforeEach(() => {
    vi.mocked(client.post).mockReset();
  });

  it("asks the server for one row with a value, whatever the view filters", async () => {
    vi.mocked(client.post).mockResolvedValue({ data: [] });
    const field = makeField({ id: "status" });

    await expect(fieldHasValues(database(), field)).resolves.toBe(false);
    expect(client.post).toHaveBeenCalledWith(
      "/databaseRecords.list",
      expect.objectContaining({
        databaseId,
        viewId: "viwFirst",
        filter: {
          conjunction: "and",
          filterSet: [
            { fieldId: "status", operator: "isNotEmpty", value: null },
          ],
        },
        replaceFilter: true,
        limit: 1,
      })
    );
  });

  it("finds checked boxes rather than filled ones", async () => {
    vi.mocked(client.post).mockResolvedValue({ data: [{ id: "rec1" }] });
    const field = makeField({ id: "done", type: DatabaseFieldType.Checkbox });

    await expect(fieldHasValues(database(), field)).resolves.toBe(true);
    expect(vi.mocked(client.post).mock.calls[0][1]).toMatchObject({
      filter: {
        filterSet: [{ fieldId: "done", operator: "is", value: true }],
      },
    });
  });

  it("assumes values when the check fails, so the reader still confirms", async () => {
    vi.mocked(client.post).mockRejectedValue(new Error("offline"));

    await expect(
      fieldHasValues(database(), makeField({ id: "status" }))
    ).resolves.toBe(true);
  });
});
