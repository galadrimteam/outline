import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { DatabaseAttachmentValue } from "@shared/databases/types";
import { AttachmentPreset } from "@shared/types";
import { Attachment } from "@server/models";
import AttachmentHelper from "@server/models/helpers/AttachmentHelper";
import FileStorage from "@server/storage/files";

/** A file to keep for an attachment cell. */
export interface EngineAttachmentInput {
  teamId: string;
  /** The Outline user uploading it. */
  userId: string;
  /** Path of the uploaded file on the local disk. */
  filePath: string;
  fileName: string;
  mimeType: string;
}

/** Where the Outline engine keeps the files of attachment cells. */
export interface EngineAttachmentStorage {
  /**
   * Stores a file and returns the value an attachment cell holds for it.
   *
   * @param input the file and who uploads it.
   * @returns the attachment value, with a URL the browser can load.
   */
  store(input: EngineAttachmentInput): Promise<DatabaseAttachmentValue>;
}

/**
 * Keeps the files of attachment cells as Outline attachments of the team, in
 * Outline's file storage, served by `attachments.redirect` to its members.
 */
export class OutlineAttachmentStorage implements EngineAttachmentStorage {
  async store(input: EngineAttachmentInput): Promise<DatabaseAttachmentValue> {
    const id = randomUUID();
    const acl = AttachmentHelper.presetToAcl(
      AttachmentPreset.DocumentAttachment
    );
    const key = AttachmentHelper.getKey({
      id,
      name: input.fileName,
      userId: input.userId,
    });
    const { size } = await stat(input.filePath);
    await FileStorage.store({
      body: createReadStream(input.filePath),
      contentLength: size,
      contentType: input.mimeType,
      key,
      acl,
    });
    const attachment = await Attachment.create({
      id,
      key,
      acl,
      size,
      contentType: input.mimeType,
      teamId: input.teamId,
      userId: input.userId,
    });
    const url = attachment.url;
    return {
      id: attachment.id,
      name: input.fileName,
      mimetype: input.mimeType,
      size,
      url,
      thumbnailUrl: input.mimeType.startsWith("image/") ? url : undefined,
      path: attachment.key,
    };
  }
}
