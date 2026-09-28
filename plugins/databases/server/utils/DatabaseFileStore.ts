import { createHash } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { AttachmentPreset } from "@shared/types";
import attachmentCreator from "@server/commands/attachmentCreator";
import { createContext } from "@server/context";
import type { User } from "@server/models";
import AttachmentHelper from "@server/models/helpers/AttachmentHelper";

/** Keeps the files of attachment cells in Outline. */
export interface DatabaseFileStore {
  /** The largest file accepted, in bytes. */
  readonly maxSize: number;

  /**
   * Stores a file; storing the same source again returns the same file.
   *
   * @param file the file, and a stable id of where it comes from.
   * @returns the stored file, with a URL a signed-in browser can load.
   */
  store(file: DatabaseFileInput): Promise<DatabaseStoredFile>;
}

export interface DatabaseFileInput {
  /** Identifies the file at its source, for idempotency (Teable's attachment token). */
  sourceId: string;
  name: string;
  buffer: Buffer;
  contentType: string;
}

export interface DatabaseStoredFile {
  id: string;
  url: string;
  /** Where the file is in Outline's file storage. */
  key: string;
}

/**
 * Stores files as private attachments of the team, owned by a user. Any
 * member of the team can load them (`attachments.redirect`), which matches who
 * can read a database's cells, but not the anonymous readers of a share.
 */
export class OutlineAttachmentFileStore implements DatabaseFileStore {
  /**
   * @param user the owner of the attachments.
   */
  constructor(private readonly user: User) {}

  get maxSize(): number {
    return AttachmentHelper.presetToMaxUploadSize(
      AttachmentPreset.DocumentAttachment
    );
  }

  async store(file: DatabaseFileInput): Promise<DatabaseStoredFile> {
    const attachment = await attachmentCreator({
      id: stableId(`${this.user.teamId}:${file.sourceId}`),
      name: file.name,
      user: this.user,
      buffer: file.buffer,
      type: file.contentType,
      preset: AttachmentPreset.DocumentAttachment,
      ctx: createContext({ user: this.user }),
    });
    if (!attachment) {
      throw new Error("The file could not be stored");
    }
    return { id: attachment.id, url: attachment.url, key: attachment.key };
  }
}

/** A UUID derived from a key: attachment ids must be version 4 UUIDs. */
function stableId(key: string): string {
  return uuidv4({
    random: createHash("sha256").update(key).digest().subarray(0, 16),
  });
}
