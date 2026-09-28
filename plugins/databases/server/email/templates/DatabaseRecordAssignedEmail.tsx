import * as React from "react";
import { NotificationEventType } from "@shared/types";
import type { EmailProps } from "@server/emails/templates/BaseEmail";
import BaseEmail, {
  EmailMessageCategory,
} from "@server/emails/templates/BaseEmail";
import Body from "@server/emails/templates/components/Body";
import Button from "@server/emails/templates/components/Button";
import EmailTemplate from "@server/emails/templates/components/EmailLayout";
import EmptySpace from "@server/emails/templates/components/EmptySpace";
import Footer from "@server/emails/templates/components/Footer";
import Header from "@server/emails/templates/components/Header";
import Heading from "@server/emails/templates/components/Heading";
import { Database, User } from "@server/models";
import NotificationSettingsHelper from "@server/models/helpers/NotificationSettingsHelper";
import { can } from "@server/policies";

type InputProps = EmailProps & {
  userId: string;
  teamUrl: string;
  actorName: string;
  databaseId: string;
  recordId: string;
  recordTitle: string;
  databaseTitle: string;
};

type BeforeSend = {
  unsubscribeUrl: string;
};

type Props = InputProps & BeforeSend;

/**
 * Email sent to a person when someone adds them to a person property of a
 * database row, like Notion's assignment notification.
 */
export class DatabaseRecordAssignedEmail extends BaseEmail<
  InputProps,
  BeforeSend
> {
  protected get category() {
    return EmailMessageCategory.Notification;
  }

  protected async beforeSend(props: InputProps) {
    const [database, recipient] = await Promise.all([
      Database.findByPkForUser(props.databaseId, props.userId),
      User.findByPk(props.userId),
    ]);
    if (!database || !recipient || !can(recipient, "read", database)) {
      return false;
    }
    return { unsubscribeUrl: this.unsubscribeUrl(props) };
  }

  protected unsubscribeUrl({ userId }: InputProps) {
    return NotificationSettingsHelper.unsubscribeUrl(
      userId,
      NotificationEventType.AddedToDatabaseRecord
    );
  }

  protected subject(props: Props) {
    return this.t("{{ actorName }} added you to “{{ recordTitle }}”", {
      actorName: props.actorName,
      recordTitle: this.recordTitle(props),
    });
  }

  protected preview({ actorName }: Props): string {
    return this.t("{{ actorName }} added you to a database row", {
      actorName,
    });
  }

  protected fromName({ actorName }: Props) {
    return actorName;
  }

  protected renderAsText(props: Props): string {
    return `
${this.t("You were added to a row")}

${this.t("{{ actorName }} added you to “{{ recordTitle }}” in {{ databaseTitle }}.", this.names(props))}

${this.t("Open page")}: ${this.recordUrl(props)}
`;
  }

  protected render(props: Props) {
    const recordLink = `${this.recordUrl(props)}?ref=notification-email`;
    const { actorName, recordTitle, databaseTitle } = this.names(props);

    return (
      <EmailTemplate
        previewText={this.preview(props)}
        goToAction={{ url: recordLink, name: this.t("Open page") }}
      >
        <Header />

        <Body>
          <Heading>{this.t("You were added to a row")}</Heading>
          <p>
            {this.t("{{ actorName }} added you to", { actorName })}{" "}
            <a href={recordLink}>{recordTitle}</a>{" "}
            {this.t("in {{ databaseTitle }}", { databaseTitle })}.
          </p>
          <EmptySpace height={10} />
          <p>
            <Button href={recordLink}>{this.t("Open page")}</Button>
          </p>
        </Body>

        <Footer
          unsubscribeUrl={props.unsubscribeUrl}
          unsubscribeText={this.t("Unsubscribe from these emails")}
        />
      </EmailTemplate>
    );
  }

  private recordUrl({ teamUrl, databaseId, recordId }: InputProps) {
    return `${teamUrl}/db/${databaseId}/row/${recordId}`;
  }

  private recordTitle({ recordTitle }: InputProps) {
    return recordTitle || this.t("Untitled");
  }

  private names(props: InputProps) {
    return {
      actorName: props.actorName,
      recordTitle: this.recordTitle(props),
      databaseTitle: props.databaseTitle || this.t("Untitled database"),
    };
  }
}
