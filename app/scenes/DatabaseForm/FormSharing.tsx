import copy from "copy-to-clipboard";
import { observer } from "mobx-react";
import { LinkIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import type { DatabaseFormSharing } from "@shared/databases/forms";
import type { DatabaseView } from "@shared/databases/types";
import { s } from "@shared/styles";
import Button from "~/components/Button";
import Switch from "~/components/Switch";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { databaseRpc } from "~/stores/DatabasesStore";

interface Props {
  database: Database;
  /** A form view of the database. */
  view: DatabaseView;
}

interface SharingPatch {
  public?: boolean;
  requireLogin?: boolean;
  successMessage?: string | null;
  resetLink?: boolean;
}

/**
 * The sharing of a form view, for its editors: a public link anyone can fill
 * the form through, optionally for signed-in members only, and the message
 * shown once an answer is sent.
 *
 * @param props the database and the form view.
 * @returns the sharing panel.
 */
export const FormSharing = observer(function FormSharing_({
  database,
  view,
}: Props) {
  const { t } = useTranslation();
  const { databases } = useStores();
  const form = view.overrides.form ?? {};
  const [message, setMessage] = React.useState(form.successMessage ?? "");
  const [isSaving, setIsSaving] = React.useState(false);
  const url =
    form.public && form.slug
      ? `${window.location.origin}/f/${form.slug}`
      : null;

  const share = React.useCallback(
    async (patch: SharingPatch) => {
      setIsSaving(true);
      try {
        await databaseRpc<DatabaseFormSharing>("/databaseForms.share", {
          databaseId: database.id,
          viewId: view.id,
          ...patch,
        });
        await databases.fetch(database.id, { force: true });
      } catch (_err) {
        toast.error(t("Couldn’t change the sharing of the form"));
      } finally {
        setIsSaving(false);
      }
    },
    [database.id, databases, t, view.id]
  );

  const handleCopy = React.useCallback(() => {
    if (url) {
      copy(url);
      toast.success(t("Link copied to clipboard"));
    }
  }, [url, t]);

  const handleMessageBlur = React.useCallback(() => {
    if (message.trim() !== (form.successMessage ?? "")) {
      void share({ successMessage: message.trim() || null });
    }
  }, [form.successMessage, message, share]);

  return (
    <Panel>
      <Switch
        label={t("Anyone with the link can answer")}
        checked={!!form.public}
        disabled={isSaving}
        onChange={(checked) => void share({ public: checked })}
      />
      {form.public && (
        <>
          <Switch
            label={t("Only signed-in members of the workspace")}
            checked={!!form.requireLogin}
            disabled={isSaving}
            onChange={(checked) => void share({ requireLogin: checked })}
          />
          {url && (
            <LinkRow>
              <LinkIcon size={18} />
              <LinkText title={url}>{url}</LinkText>
              <Button type="button" neutral onClick={handleCopy}>
                {t("Copy link")}
              </Button>
            </LinkRow>
          )}
          <Label>
            {t("Message after sending")}
            <MessageInput
              value={message}
              rows={2}
              placeholder={t("Thank you, your answer was sent.")}
              onChange={(event) => setMessage(event.target.value)}
              onBlur={handleMessageBlur}
            />
          </Label>
          <div>
            <Button
              type="button"
              neutral
              disabled={isSaving}
              onClick={() => void share({ resetLink: true })}
            >
              {t("Change the link")}
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
});

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const LinkRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 4px 4px 8px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 6px;

  svg {
    flex-shrink: 0;
    fill: ${s("textTertiary")};
  }
`;

const LinkText = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Label = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: ${s("textSecondary")};
  font-size: 13px;
`;

const MessageInput = styled.textarea`
  padding: 6px 8px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 6px;
  background: ${s("inputBackground")};
  color: ${s("text")};
  font: inherit;
  font-size: 14px;
  resize: vertical;
  outline: none;

  &:focus {
    border-color: ${s("inputBorderFocused")};
  }
`;
