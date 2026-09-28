import { Database } from "@server/models";
import {
  buildDatabase,
  buildDocument,
  buildUser,
} from "@server/test/factories";
import type { DocumentEvent } from "@server/types";
import { DatabaseAnchorTitleProcessor } from "./DatabaseAnchorTitleProcessor";

function renamed(documentId: string, teamId: string, actorId: string) {
  const event: DocumentEvent = {
    name: "documents.title_change",
    documentId,
    collectionId: "",
    teamId,
    actorId,
    ip: null,
    createdAt: new Date().toISOString(),
  };
  return event;
}

function withDatabaseNode(databaseId: string, fullPage: boolean) {
  return {
    type: "doc",
    content: [
      {
        type: "database",
        attrs: {
          id: "node",
          databaseId,
          viewIds: null,
          fullPage,
          legacyHref: null,
        },
      },
    ],
  };
}

describe("DatabaseAnchorTitleProcessor", () => {
  it("gives a full-page database the title of its page", async () => {
    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      title: "Suivi Kanban",
    });
    const database = await buildDatabase({
      teamId: user.teamId,
      documentId: document.id,
      title: "Ancien titre",
    });
    document.content = withDatabaseNode(database.id, true);
    await document.save({ silent: true });

    const event = renamed(document.id, user.teamId, user.id);
    expect(await DatabaseAnchorTitleProcessor.shouldQueue(event)).toBe(true);
    await new DatabaseAnchorTitleProcessor().perform(event);

    expect((await Database.findByPk(database.id))?.title).toEqual(
      "Suivi Kanban"
    );
  });

  it("leaves an inline database's own title alone", async () => {
    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      title: "Projet",
    });
    const database = await buildDatabase({
      teamId: user.teamId,
      documentId: document.id,
      title: "Tickets",
    });
    document.content = withDatabaseNode(database.id, false);
    await document.save({ silent: true });

    await new DatabaseAnchorTitleProcessor().perform(
      renamed(document.id, user.teamId, user.id)
    );

    expect((await Database.findByPk(database.id))?.title).toEqual("Tickets");
  });
});
