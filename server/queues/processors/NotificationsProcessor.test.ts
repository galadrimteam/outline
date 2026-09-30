import { randomUUID } from "node:crypto";
import type { CommentEvent } from "@server/types";
import { AuthenticationType } from "@server/types";
import { mockTaskSchedule } from "@server/test/support";
import CommentCreatedNotificationsTask from "../tasks/CommentCreatedNotificationsTask";
import NotificationsProcessor from "./NotificationsProcessor";

describe("NotificationsProcessor", () => {
  const schedule = mockTaskSchedule();

  const commentCreated = (source?: "import"): CommentEvent => ({
    name: "comments.create",
    modelId: randomUUID(),
    documentId: randomUUID(),
    teamId: randomUUID(),
    actorId: randomUUID(),
    ip: "127.0.0.1",
    authType: AuthenticationType.API,
    data: source ? { source } : undefined,
  });

  it("should schedule the notifications of a new comment", async () => {
    const event = commentCreated();

    await new NotificationsProcessor().perform(event);

    expect(schedule).toHaveBeenCalledWith(event);
    expect(schedule.mock.contexts[0]).toBeInstanceOf(
      CommentCreatedNotificationsTask
    );
  });

  it("should notify nobody of an imported comment", async () => {
    await new NotificationsProcessor().perform(commentCreated("import"));

    expect(schedule).not.toHaveBeenCalled();
  });
});
