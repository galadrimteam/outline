import { Database } from "@server/models";
import {
  buildCollection,
  buildDatabase,
  buildDocument,
  buildUser,
} from "@server/test/factories";
import { getTestServer } from "@server/test/support";
import { FakeTablesDuplicator } from "../engine/__mocks__/FakeTablesDuplicator";
import { setTablesDuplicatorFactory } from "../engine/tablesDuplicator";

const server = getTestServer();

let duplicator: FakeTablesDuplicator;

beforeEach(() => {
  duplicator = new FakeTablesDuplicator();
  setTablesDuplicatorFactory(() => duplicator);
});

afterEach(() => {
  setTablesDuplicatorFactory();
});

describe("#documents.duplicate with databases", () => {
  it("gives the copy its own database", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    const page = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      collectionId: collection.id,
    });
    const database = await buildDatabase({
      teamId: user.teamId,
      documentId: page.id,
    });
    page.content = {
      type: "doc",
      content: [
        {
          type: "database",
          attrs: {
            id: "blk1",
            databaseId: database.id,
            viewIds: ["viwBoard"],
            fullPage: false,
            legacyHref: null,
            title: "Suivi",
          },
        },
      ],
    };
    await page.save();

    const res = await server.post("/api/documents.duplicate", user, {
      body: { id: page.id, title: "Copie" },
    });
    const body = await res.json();

    expect(res.status).toEqual(200);
    const [copy] = body.data.documents;
    const copied = await Database.findOne({
      where: { documentId: copy.id },
      rejectOnEmpty: true,
    });
    expect(JSON.stringify(copy.data ?? copy.text)).toContain(copied.id);
    expect(duplicator.calls).toHaveLength(1);
  });
});
