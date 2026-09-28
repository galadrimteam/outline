import type { ProsemirrorData } from "@shared/types";
import type { Document } from "@server/models";
import { buildDocument, buildUser } from "@server/test/factories";
import { mockTaskSchedule } from "@server/test/support";
import type { DocumentEvent } from "@server/types";
import { ConvertImportedEmbedsProcessor } from "./ConvertImportedEmbedsProcessor";

const schedule = mockTaskSchedule();

const framed =
  "https://teable.notion-exit.galadrim.fr/framed?u=/base/bse1/table/tbl1/viw1";

const withEmbed: ProsemirrorData = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Intro" }] },
    { type: "embed", attrs: { href: framed, width: null, height: 720 } },
  ],
};

const eventFor = (
  document: Pick<Document, "id" | "teamId" | "collectionId">,
  actorId: string,
  {
    name = "documents.create",
    imported = true,
  }: {
    name?: "documents.create" | "documents.publish";
    imported?: boolean;
  } = {}
): DocumentEvent => ({
  name,
  documentId: document.id,
  collectionId: document.collectionId ?? "",
  teamId: document.teamId,
  actorId,
  ip: "127.0.0.1",
  data: imported ? { source: "import" } : undefined,
});

describe("ConvertImportedEmbedsProcessor", () => {
  it("schedules the conversion of an imported document with a Teable embed", async () => {
    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      content: withEmbed,
    });

    await new ConvertImportedEmbedsProcessor().perform(
      eventFor(document, user.id)
    );

    expect(schedule).toHaveBeenCalledWith({
      teamId: document.teamId,
      documentId: document.id,
      actorId: user.id,
      dryRun: false,
    });
  });

  it("ignores imported documents without Teable embeds", async () => {
    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
    });

    await new ConvertImportedEmbedsProcessor().perform(
      eventFor(document, user.id, { name: "documents.publish" })
    );

    expect(schedule).not.toHaveBeenCalled();
  });

  it("ignores documents that were not imported", async () => {
    const user = await buildUser();
    const document = await buildDocument({
      teamId: user.teamId,
      userId: user.id,
      content: withEmbed,
    });

    await new ConvertImportedEmbedsProcessor().perform(
      eventFor(document, user.id, { imported: false })
    );

    expect(schedule).not.toHaveBeenCalled();
  });

  describe("shouldQueue", () => {
    it("queues only the events of imports", async () => {
      const event = eventFor(
        { id: "doc", teamId: "team", collectionId: "collection" },
        "user"
      );

      expect(await ConvertImportedEmbedsProcessor.shouldQueue(event)).toBe(
        true
      );
      expect(
        await ConvertImportedEmbedsProcessor.shouldQueue(
          eventFor(
            { id: "doc", teamId: "team", collectionId: "collection" },
            "user",
            { imported: false }
          )
        )
      ).toBe(false);
    });
  });
});
