import { randomUUID } from "node:crypto";
import type { ProsemirrorData, ProsemirrorDoc } from "@shared/types";
import { MentionType } from "@shared/types";
import { Attachment, Document } from "@server/models";
import { sequelize } from "@server/storage/database";
import { buildAttachment, buildTeam } from "@server/test/factories";
import MarkdownImportsProcessor from "./MarkdownImportsProcessor";

const mention = (externalId: string): ProsemirrorData => ({
  type: "mention",
  attrs: {
    id: randomUUID(),
    type: MentionType.Document,
    modelId: externalId,
    label: "Sub-page",
  },
});

const findMentions = (node: ProsemirrorData): ProsemirrorData[] => [
  ...(node.type === "mention" ? [node] : []),
  ...(node.content ?? []).flatMap(findMentions),
];

// galadrim: regression test, two mentions of the same not-yet-created document
// used to get two different ids (the first one pointed at nothing).
describe("ImportsProcessor.rewriteReferences", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps every mention of one external document to the same id", async () => {
    // Resolves on a later tick, like the database lookup it stands for.
    vi.spyOn(Document, "findOne").mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(null), 5))
    );

    const externalId = randomUUID();
    const otherExternalId = randomUUID();
    const content: ProsemirrorDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [mention(externalId), mention(otherExternalId)],
        },
        { type: "paragraph", content: [mention(externalId)] },
        {
          type: "bullet_list",
          content: [
            {
              type: "list_item",
              content: [{ type: "paragraph", content: [mention(externalId)] }],
            },
          ],
        },
      ],
    };

    const idMap: Record<string, string> = {};
    const processor = new MarkdownImportsProcessor();
    const result: ProsemirrorDoc = await processor["rewriteReferences"]({
      content,
      attachments: [],
      idMap,
      urlIdMap: {},
      importInput: {},
      actorId: randomUUID(),
      teamId: randomUUID(),
    });

    const ids = findMentions(result).map((node) => node.attrs?.modelId);
    expect(ids).toHaveLength(4);
    expect(ids[0]).toEqual(idMap[externalId]);
    expect(ids[1]).toEqual(idMap[otherExternalId]);
    expect(ids[2]).toEqual(idMap[externalId]);
    expect(ids[3]).toEqual(idMap[externalId]);
    expect(idMap[externalId]).not.toEqual(idMap[otherExternalId]);
  });
});

const fileCard = (href: string, size: number | string): ProsemirrorDoc => ({
  type: "doc",
  content: [
    {
      type: "attachment",
      attrs: { href, title: "dashboard-eleve-excellence.html", size },
    },
  ],
});

const rewriteSizes = (content: ProsemirrorDoc, attachments: Attachment[]) =>
  new MarkdownImportsProcessor()["rewriteReferences"]({
    content,
    attachments,
    idMap: {},
    urlIdMap: {},
    importInput: {},
    actorId: randomUUID(),
    teamId: randomUUID(),
  });

// galadrim: the files of a Markdown zip have no id on their node and no page on
// their attachment, so every file card was imported with a size of 0.
describe("ImportsProcessor attachment sizes", () => {
  it("keeps the size of a file card the attachments do not know", async () => {
    const result = await rewriteSizes(
      fileCard(Attachment.getRedirectUrl(randomUUID()), "20061"),
      []
    );

    expect(result.content[0].attrs?.size).toEqual("20061");
  });

  it("takes the size of the attachment a file card links to", async () => {
    const attachment = Attachment.build({ id: randomUUID(), size: 20061 });

    const result = await rewriteSizes(
      fileCard(Attachment.getRedirectUrl(attachment.id), 0),
      [attachment]
    );

    expect(result.content[0].attrs?.size).toEqual(20061);
  });

  it("finds the attachments a page links to, in its team only", async () => {
    const team = await buildTeam();
    const linked = await buildAttachment({ teamId: team.id });
    const foreign = await buildAttachment();
    const uploaded = await buildAttachment({ teamId: team.id });
    const externalId = randomUUID();
    await uploaded.update({ documentId: externalId });

    const found: Attachment[] = await sequelize.transaction((transaction) =>
      new MarkdownImportsProcessor()["findAttachments"]({
        externalId,
        content: {
          type: "doc",
          content: [
            fileCard(linked.redirectUrl, 0).content[0],
            fileCard(foreign.redirectUrl, 0).content[0],
          ],
        },
        teamId: team.id,
        transaction,
      })
    );

    expect(found.map((attachment) => attachment.id).sort()).toEqual(
      [linked.id, uploaded.id].sort()
    );
  });
});
