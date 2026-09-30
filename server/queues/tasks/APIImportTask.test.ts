import { randomUUID } from "node:crypto";
import type { ProsemirrorDoc } from "@shared/types";
import { Attachment } from "@server/models";
import { buildUser } from "@server/test/factories";
import MarkdownAPIImportTask from "./MarkdownAPIImportTask";

describe("APIImportTask.uploadAttachments", () => {
  it("names a remote image without alt text after its node type", async () => {
    const user = await buildUser();
    const externalId = randomUUID();
    const doc: ProsemirrorDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "image",
              attrs: { src: "https://example.com/files/a.png", alt: null },
            },
          ],
        },
      ],
    };

    await new MarkdownAPIImportTask()["uploadAttachments"]({
      doc,
      externalId,
      createdBy: user,
    });

    const attachment = await Attachment.findOne({
      where: { documentId: externalId },
      rejectOnEmpty: true,
    });
    expect(attachment.name).toEqual("image");
  });
});
