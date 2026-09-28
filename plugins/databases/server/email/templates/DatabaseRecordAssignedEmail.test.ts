import { vi } from "vitest";
import mailer from "@server/emails/mailer";
import {
  buildCollection,
  buildDatabase,
  buildUser,
} from "@server/test/factories";
import { initI18n } from "@server/utils/i18n";
import { DatabaseRecordAssignedEmail } from "./DatabaseRecordAssignedEmail";

beforeAll(async () => {
  await initI18n();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DatabaseRecordAssignedEmail", () => {
  it("links to the row page of the database", async () => {
    const sendMail = vi.spyOn(mailer, "sendMail").mockResolvedValue();
    const user = await buildUser();
    const database = await buildDatabase({ teamId: user.teamId });

    await new DatabaseRecordAssignedEmail({
      to: user.email,
      userId: user.id,
      teamUrl: "https://outline.example.com",
      actorName: "Alice",
      databaseId: database.id,
      recordId: "rec1",
      recordTitle: "Fix login",
      databaseTitle: "Suivi",
    }).send();

    expect(sendMail).toHaveBeenCalledTimes(1);
    const [mail] = sendMail.mock.calls[0];
    expect(mail.subject).toEqual("Alice added you to “Fix login”");
    expect(mail.text).toContain("Alice added you to “Fix login” in Suivi.");
    expect(mail.text).toContain(
      `https://outline.example.com/db/${database.id}/row/rec1`
    );
    expect(mail.unsubscribeUrl).toContain("database_records.add_user");
  });

  it("is not sent to someone who can no longer read the database", async () => {
    const sendMail = vi.spyOn(mailer, "sendMail").mockResolvedValue();
    const owner = await buildUser();
    const user = await buildUser({ teamId: owner.teamId });
    const collection = await buildCollection({
      teamId: owner.teamId,
      userId: owner.id,
      permission: null,
    });
    const database = await buildDatabase({
      teamId: owner.teamId,
      collectionId: collection.id,
    });

    await new DatabaseRecordAssignedEmail({
      to: user.email,
      userId: user.id,
      teamUrl: "https://outline.example.com",
      actorName: "Alice",
      databaseId: database.id,
      recordId: "rec1",
      recordTitle: "Fix login",
      databaseTitle: "Suivi",
    }).send();

    expect(sendMail).not.toHaveBeenCalled();
  });
});
