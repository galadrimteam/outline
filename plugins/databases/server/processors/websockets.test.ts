import type { Server } from "socket.io";
import WebsocketsProcessor from "@server/queues/processors/WebsocketsProcessor";
import {
  buildCollection,
  buildDatabase,
  buildDocument,
  buildUser,
} from "@server/test/factories";
import type { DatabaseEvent } from "@server/types";

function fakeSocketServer() {
  const emitted: { channels: string[]; name: string; payload: unknown }[] = [];
  const socketio = {
    to: (channels: string[]) => ({
      emit: (name: string, payload: unknown) => {
        emitted.push({ channels, name, payload });
        return true;
      },
    }),
  };
  return { emitted, socketio: socketio as unknown as Server };
}

function databaseChange(
  overrides: Pick<DatabaseEvent, "modelId" | "teamId" | "collectionId">
): DatabaseEvent {
  return {
    name: "databases.change",
    actorId: "",
    documentId: null,
    data: {
      kinds: ["record.update"],
      recordIds: ["rec1"],
      fieldIds: [],
      viewIds: [],
      origin: "tab-1",
      changes: [
        { recordId: "rec1", fieldId: "fldName", before: "secret", after: "x" },
      ],
    },
    ...overrides,
  };
}

describe("WebsocketsProcessor databases.change", () => {
  it("sends ids only to the channels of the anchor document", async () => {
    const user = await buildUser();
    const collection = await buildCollection({
      teamId: user.teamId,
      userId: user.id,
    });
    const document = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      collectionId: collection.id,
    });
    const database = await buildDatabase({
      teamId: user.teamId,
      documentId: document.id,
    });
    const { emitted, socketio } = fakeSocketServer();

    await new WebsocketsProcessor().perform(
      databaseChange({
        modelId: database.id,
        teamId: database.teamId,
        collectionId: database.collectionId,
      }),
      socketio
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0].name).toEqual("databases.change");
    expect(emitted[0].channels).toContain(`collection-${collection.id}`);
    expect(emitted[0].payload).toEqual({
      databaseId: database.id,
      kinds: ["record.update"],
      recordIds: ["rec1"],
      fieldIds: [],
      viewIds: [],
      actorId: null,
      origin: "tab-1",
    });
  });

  it("uses the collection channels for a database without a home page", async () => {
    const collection = await buildCollection();
    const database = await buildDatabase({
      teamId: collection.teamId,
      collectionId: collection.id,
    });
    const { emitted, socketio } = fakeSocketServer();

    await new WebsocketsProcessor().perform(
      databaseChange({
        modelId: database.id,
        teamId: database.teamId,
        collectionId: database.collectionId,
      }),
      socketio
    );

    expect(emitted[0].channels).toEqual([
      `collection-${collection.id}`,
      `team-${collection.teamId}.members`,
    ]);
  });
});
