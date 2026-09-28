import type { DatabaseSlackAction } from "@shared/databases/automations";
import { SLACK_WEBHOOK_PATTERN } from "@shared/databases/automations";
import { ValidationError } from "@server/errors";
import fetch from "@server/utils/fetch";
import type { AutomationRunContext } from "../context";
import { rowTitle, rowUrl, templateVariablesFor } from "../context";
import { renderTemplate } from "../templates";
import type { AutomationActionExecutor } from "./types";

/** Posts a JSON body to a webhook, throwing when it is not accepted. */
export type WebhookPoster = (url: string, body: object) => Promise<void>;

/**
 * Posts a message to a Slack channel through an incoming webhook. Without a
 * message, the row's title and link are posted.
 */
export class SlackExecutor implements AutomationActionExecutor<DatabaseSlackAction> {
  constructor(private readonly post: WebhookPoster = postJson) {}

  async execute(
    action: DatabaseSlackAction,
    context: AutomationRunContext
  ): Promise<void> {
    if (!SLACK_WEBHOOK_PATTERN.test(action.webhookUrl)) {
      throw ValidationError("The Slack webhook address is not valid");
    }
    const message = renderTemplate(
      action.message,
      templateVariablesFor(context)
    ).trim();
    const text =
      message || `<${rowUrl(context)}|${escapeSlack(rowTitle(context))}>`;
    await this.post(action.webhookUrl, { text });
  }
}

async function postJson(url: string, body: object): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeout: 10000,
  });
  if (!res.ok) {
    throw new Error(`Slack refused the message (HTTP ${res.status})`);
  }
}

function escapeSlack(text: string): string {
  return (text || "Untitled")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
