import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import type { DatabaseView } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { s, hover } from "@shared/styles";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { isStackable } from "../../boardModel";

interface Props {
  database: Database;
  view: DatabaseView;
  readOnly: boolean;
}

/**
 * Shown when a board has no property to group its cards by: pick a select
 * property, or create a « Status » one.
 */
export const BoardSetup = observer(function BoardSetup({
  database,
  view,
  readOnly,
}: Props) {
  const { t } = useTranslation();
  const { databases } = useStores();
  const [isSaving, setIsSaving] = React.useState(false);
  const candidates = (database.fields ?? []).filter(isStackable);

  const stackBy = React.useCallback(
    async (fieldId: string) => {
      setIsSaving(true);
      try {
        await databases.updateView(database.id, view.id, {
          options: { stackFieldId: fieldId },
        });
      } catch (_err) {
        toast.error(t("Couldn’t update the view"));
      } finally {
        setIsSaving(false);
      }
    },
    [databases, database.id, view.id, t]
  );

  const handleCreate = React.useCallback(async () => {
    setIsSaving(true);
    try {
      const field = await databases.createField(database.id, {
        name: t("Status"),
        type: DatabaseFieldType.SingleSelect,
        options: {
          choices: [
            { name: t("Not started"), color: "grayLight2" },
            { name: t("In progress"), color: "blueLight2" },
            { name: t("Done"), color: "greenLight2" },
          ],
        },
      });
      await databases.updateView(database.id, view.id, {
        options: { stackFieldId: field.id },
      });
    } catch (_err) {
      toast.error(t("Couldn’t create the property"));
    } finally {
      setIsSaving(false);
    }
  }, [databases, database.id, view.id, t]);

  return (
    <Wrapper>
      <Message>
        {t("A board groups cards by a select property.")}
        {readOnly
          ? ` ${t("Ask someone who can edit this database to choose one.")}`
          : ""}
      </Message>
      {!readOnly && (
        <Choices>
          {candidates.map((field) => (
            <Choice
              key={field.id}
              disabled={isSaving}
              onClick={() => void stackBy(field.id)}
            >
              {t("Group by {{ name }}", { name: field.name })}
            </Choice>
          ))}
          <Choice disabled={isSaving} onClick={() => void handleCreate()}>
            {t("Create a Status property")}
          </Choice>
        </Choices>
      )}
    </Wrapper>
  );
});

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 24px 4px;
`;

const Message = styled.p`
  margin: 0;
  color: ${s("textSecondary")};
  font-size: 14px;
`;

const Choices = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const Choice = styled.button`
  height: 28px;
  padding: 0 10px;
  border: 1px solid ${s("divider")};
  border-radius: 6px;
  background: none;
  color: ${s("text")};
  font: inherit;
  font-size: 14px;
  cursor: var(--pointer);

  &:${hover}:not(:disabled) {
    background: ${s("listItemHoverBackground")};
  }
`;
