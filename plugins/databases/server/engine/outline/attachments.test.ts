import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Attachment } from "@server/models";
import FileStorage from "@server/storage/files";
import { buildUser } from "@server/test/factories";
import { OutlineAttachmentStorage } from "./attachments";

describe("OutlineAttachmentStorage", () => {
  it("keeps a file as an attachment of the team and returns its cell value", async () => {
    const user = await buildUser();
    const filePath = path.join(os.tmpdir(), `engine-${user.id}.txt`);
    await writeFile(filePath, "hello world");
    const store = vi.spyOn(FileStorage, "store").mockResolvedValue("stored");

    try {
      const value = await new OutlineAttachmentStorage().store({
        teamId: user.teamId,
        userId: user.id,
        filePath,
        fileName: "notes.txt",
        mimeType: "text/plain",
      });

      const attachment = await Attachment.findByPk(value.id, {
        rejectOnEmpty: true,
      });
      expect(attachment).toMatchObject({
        teamId: user.teamId,
        userId: user.id,
        contentType: "text/plain",
      });
      expect(Number(attachment.size)).toBe(11);
      expect(value).toMatchObject({
        name: "notes.txt",
        mimetype: "text/plain",
        size: 11,
        url: attachment.url,
      });
      expect(store).toHaveBeenCalledWith(
        expect.objectContaining({ key: attachment.key, contentLength: 11 })
      );
    } finally {
      store.mockRestore();
    }
  });
});
