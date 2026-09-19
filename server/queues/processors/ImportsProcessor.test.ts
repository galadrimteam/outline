import { randomUUID } from "node:crypto";
import type { ProsemirrorData, ProsemirrorDoc } from "@shared/types";
import { MentionType } from "@shared/types";
import { Document } from "@server/models";
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
