import { v4 as uuidv4 } from "uuid";
import type { DatabaseNotifyAction } from "@shared/databases/automations";
import type { ProsemirrorData } from "@shared/types";
import { MentionType } from "@shared/types";
import { CommentValidation } from "@shared/validations";
import { databaseRowDocumentCreator } from "@server/commands/databaseRowDocumentCreator";
import { createContext } from "@server/context";
import { ValidationError } from "@server/errors";
import { Comment, User } from "@server/models";
import { sequelize } from "@server/storage/database";
import { cellOutlineUserIds } from "../cellValues";
import type { AutomationRunContext } from "../context";
import { rowTitle, templateVariablesFor } from "../context";
import { renderTemplate } from "../templates";
import type { AutomationActionExecutor } from "./types";

/**
 * Notifies people through a comment on the row's page that mentions them, so
 * that Outline's mention notifications (in-app and email) reach them. The
 * comment is written by the automation's author, who is not notified of it.
 */
export class NotifyExecutor implements AutomationActionExecutor<DatabaseNotifyAction> {
  async execute(
    action: DatabaseNotifyAction,
    context: AutomationRunContext
  ): Promise<void> {
    const recipients = await this.recipients(action, context);
    if (!recipients.length) {
      return;
    }
    const author = context.author ?? context.actor;
    if (!author) {
      throw ValidationError(
        "The automation's author left the team: nobody to notify as"
      );
    }
    const message = renderTemplate(
      action.message,
      templateVariablesFor(context)
    ).trim();

    await sequelize.transaction(async (transaction) => {
      const document = await databaseRowDocumentCreator(
        { user: author, transaction },
        {
          database: context.database,
          recordId: context.record.id,
          title: rowTitle(context),
          icon: rowIcon(context),
        }
      );
      await Comment.createWithCtx(
        createContext({ user: author, transaction }),
        {
          documentId: document.id,
          createdById: author.id,
          data: notificationComment(
            context.automation.name,
            message,
            recipients,
            author.id
          ),
        }
      );
    });
  }

  private async recipients(
    action: DatabaseNotifyAction,
    context: AutomationRunContext
  ): Promise<User[]> {
    const ids = new Set(action.userIds ?? []);
    if (action.personFieldId) {
      cellOutlineUserIds(context.record.fields[action.personFieldId]).forEach(
        (id) => ids.add(id)
      );
    }
    if (!ids.size) {
      return [];
    }
    return User.findAll({
      where: {
        id: [...ids],
        teamId: context.database.teamId,
        suspendedAt: null,
      },
      order: [["name", "ASC"]],
    });
  }
}

function rowIcon(context: AutomationRunContext): string | null {
  const fieldId = context.database.settings?.iconFieldId;
  const icon = fieldId ? context.record.fields[fieldId] : undefined;
  return typeof icon === "string" && icon ? icon : null;
}

function notificationComment(
  name: string,
  message: string,
  recipients: User[],
  actorId: string
): ProsemirrorData {
  const lead = `⚡ ${name || "Automation"}${message ? ` · ${message}` : ""}`;
  const mentions = recipients.flatMap((user): ProsemirrorData[] => [
    { type: "text", text: " " },
    {
      type: "mention",
      attrs: {
        type: MentionType.User,
        label: user.name,
        modelId: user.id,
        actorId,
        id: uuidv4(),
      },
    },
  ]);
  const room =
    CommentValidation.maxLength -
    recipients.reduce((total, user) => total + user.name.length + 2, 0);
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: lead.slice(0, Math.max(room, 40)) },
          ...mentions,
        ],
      },
    ],
  };
}
