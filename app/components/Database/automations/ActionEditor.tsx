import { observer } from "mobx-react";
import { CloseIcon, PlusIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  DatabaseAutomationAction,
  DatabaseCreateRecordAction,
  DatabaseNotifyAction,
  DatabaseSetPropertyAction,
  DatabaseSlackAction,
} from "@shared/databases/automations";
import type { DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { s } from "@shared/styles";
import NudeButton from "~/components/NudeButton";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { CompactSelect, SmallInput } from "../toolbar/components";
import {
  actionTypeLabel,
  defaultValueFor,
  settableFields,
} from "./automationText";
import { CellValueField } from "./CellValueField";
import { ValueEditor } from "./ValueEditor";

interface Props {
  /** The automation's database. */
  database: Database;
  action: DatabaseAutomationAction;
  onChange: (action: DatabaseAutomationAction) => void;
  onRemove: () => void;
}

/**
 * Edits one action of an automation, with the editor of its kind.
 *
 * @param props the action and its callbacks.
 * @returns the action card.
 */
export const ActionEditor = observer(function ActionEditor_({
  database,
  action,
  onChange,
  onRemove,
}: Props) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{actionTypeLabel(action.type, t)}</CardTitle>
        <NudeButton
          size={24}
          aria-label={t("Remove action")}
          onClick={onRemove}
        >
          <CloseIcon size={18} />
        </NudeButton>
      </CardHeader>
      {action.type === "setProperty" && (
        <SetPropertyEditor
          database={database}
          action={action}
          onChange={onChange}
        />
      )}
      {action.type === "notify" && (
        <NotifyEditor database={database} action={action} onChange={onChange} />
      )}
      {action.type === "slack" && (
        <SlackEditor action={action} onChange={onChange} />
      )}
      {action.type === "createRecord" && (
        <CreateRecordEditor
          database={database}
          action={action}
          onChange={onChange}
        />
      )}
    </Card>
  );
});

const SetPropertyEditor = observer(function SetPropertyEditor_({
  database,
  action,
  onChange,
}: {
  database: Database;
  action: DatabaseSetPropertyAction;
  onChange: (action: DatabaseSetPropertyAction) => void;
}) {
  const { t } = useTranslation();
  const fields = settableFields(database.fields ?? []);
  const field = fields.find((item) => item.id === action.fieldId);

  return (
    <Stack>
      <CompactSelect
        value={action.fieldId || undefined}
        options={fields.map((item) => ({ value: item.id, label: item.name }))}
        onChange={(fieldId) => {
          const next = fields.find((item) => item.id === fieldId);
          if (next) {
            onChange({
              ...action,
              fieldId,
              value: defaultValueFor(next, database.id),
            });
          }
        }}
        ariaLabel={t("Property")}
        placeholder={t("Choose a property")}
      />
      {field && (
        <ValueEditor
          database={database}
          field={field}
          value={action.value}
          sourceDatabaseId={database.id}
          onChange={(value) => onChange({ ...action, value })}
        />
      )}
    </Stack>
  );
});

const NotifyEditor = observer(function NotifyEditor_({
  database,
  action,
  onChange,
}: {
  database: Database;
  action: DatabaseNotifyAction;
  onChange: (action: DatabaseNotifyAction) => void;
}) {
  const { t } = useTranslation();
  const personFields = (database.fields ?? []).filter(
    (field) =>
      field.type === DatabaseFieldType.User ||
      field.type === DatabaseFieldType.CreatedBy ||
      field.type === DatabaseFieldType.LastModifiedBy
  );
  const peopleField = React.useMemo(() => peoplePickerField(t("People")), [t]);

  return (
    <Stack>
      <Label>{t("People")}</Label>
      <CellValueField
        database={database}
        field={peopleField}
        label={t("People to notify")}
        value={(action.userIds ?? []).map((outlineUserId) => ({
          outlineUserId,
        }))}
        onChange={(value) =>
          onChange({
            ...action,
            userIds: Array.isArray(value)
              ? value.flatMap((item) =>
                  typeof item === "object" &&
                  item !== null &&
                  "outlineUserId" in item &&
                  typeof item.outlineUserId === "string"
                    ? [item.outlineUserId]
                    : []
                )
              : [],
          })
        }
      />
      {personFields.length > 0 && (
        <CompactSelect
          value={action.personFieldId ?? ""}
          options={[
            { value: "", label: t("And nobody else") },
            ...personFields.map((field) => ({
              value: field.id,
              label: t("And the people in {{ property }}", {
                property: field.name,
              }),
            })),
          ]}
          onChange={(personFieldId) =>
            onChange({ ...action, personFieldId: personFieldId || undefined })
          }
          ariaLabel={t("Person property")}
        />
      )}
      <Label>{t("Message")}</Label>
      <MessageInput
        value={action.message}
        rows={2}
        placeholder={t("Optional; variables like {{ example }} are replaced", {
          example: "{{title}}",
        })}
        onChange={(event) =>
          onChange({ ...action, message: event.target.value })
        }
      />
      <Hint>
        {t(
          "They get a notification and an email: a comment mentioning them is posted on the row's page."
        )}
      </Hint>
    </Stack>
  );
});

function SlackEditor({
  action,
  onChange,
}: {
  action: DatabaseSlackAction;
  onChange: (action: DatabaseSlackAction) => void;
}) {
  const { t } = useTranslation();

  return (
    <Stack>
      <Label>{t("Incoming webhook")}</Label>
      <SmallInput
        value={action.webhookUrl}
        type="url"
        placeholder="https://hooks.slack.com/services/…"
        aria-label={t("Incoming webhook")}
        onChange={(event) =>
          onChange({ ...action, webhookUrl: event.target.value.trim() })
        }
      />
      <Label>{t("Message")}</Label>
      <MessageInput
        value={action.message}
        rows={3}
        placeholder={t("Optional; variables like {{ example }} are replaced", {
          example: "{{title}} {{url}} {{property:Statut}}",
        })}
        onChange={(event) =>
          onChange({ ...action, message: event.target.value })
        }
      />
    </Stack>
  );
}

const CreateRecordEditor = observer(function CreateRecordEditor_({
  database,
  action,
  onChange,
}: {
  database: Database;
  action: DatabaseCreateRecordAction;
  onChange: (action: DatabaseCreateRecordAction) => void;
}) {
  const { t } = useTranslation();
  const { databases } = useStores();
  const [choices, setChoices] = React.useState<Database[]>([database]);
  const target = databases.get(action.databaseId);
  const targetFields = target?.isSchemaLoaded
    ? settableFields(target.fields)
    : [];

  React.useEffect(() => {
    let cancelled = false;
    databases
      .list({ limit: 100 })
      .then((items) => {
        if (!cancelled) {
          setChoices(
            items.some((item) => item.id === database.id)
              ? [...items]
              : [database, ...items]
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [databases, database]);

  React.useEffect(() => {
    if (action.databaseId) {
      void databases.fetch(action.databaseId).catch(() => undefined);
    }
  }, [databases, action.databaseId]);

  const unused = targetFields.filter((field) => !(field.id in action.fields));

  const handleAdd = (fieldId: string) => {
    const field = targetFields.find((item) => item.id === fieldId);
    if (field) {
      onChange({
        ...action,
        fields: {
          ...action.fields,
          [field.id]: defaultValueFor(field, database.id),
        },
      });
    }
  };

  const handleRemove = (fieldId: string) => {
    const { [fieldId]: _removed, ...rest } = action.fields;
    onChange({ ...action, fields: rest });
  };

  return (
    <Stack>
      <CompactSelect
        value={action.databaseId || undefined}
        options={choices.map((item) => ({
          value: item.id,
          label: item.id === database.id ? t("This database") : item.title,
        }))}
        onChange={(databaseId) =>
          onChange({ ...action, databaseId, fields: {} })
        }
        ariaLabel={t("Database")}
        placeholder={t("Choose a database")}
      />
      {target &&
        targetFields
          .filter((field) => field.id in action.fields)
          .map((field) => (
            <FieldRow key={field.id}>
              <FieldName title={field.name}>{field.name}</FieldName>
              <Grow>
                <ValueEditor
                  database={target}
                  field={field}
                  value={action.fields[field.id]}
                  sourceDatabaseId={database.id}
                  onChange={(value) =>
                    onChange({
                      ...action,
                      fields: { ...action.fields, [field.id]: value },
                    })
                  }
                />
              </Grow>
              <NudeButton
                size={24}
                aria-label={t("Remove")}
                onClick={() => handleRemove(field.id)}
              >
                <CloseIcon size={16} />
              </NudeButton>
            </FieldRow>
          ))}
      {unused.length > 0 && (
        <AddRow>
          <PlusIcon size={18} />
          <CompactSelect
            value={undefined}
            options={unused.map((field) => ({
              value: field.id,
              label: field.name,
            }))}
            onChange={handleAdd}
            ariaLabel={t("Add a property")}
            placeholder={t("Add a property")}
            borderless
          />
        </AddRow>
      )}
    </Stack>
  );
});

/** A person field outside of any database, to pick Outline members with the person cell editor. */
function peoplePickerField(name: string): DatabaseField {
  return {
    id: "people",
    name,
    type: DatabaseFieldType.User,
    options: { isMultiple: true },
    isPrimary: false,
    isComputed: false,
    isLookup: false,
    cellValueType: "string",
    isMultipleCellValue: true,
  };
}

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
  border: 1px solid ${s("divider")};
  border-radius: 8px;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const CardTitle = styled.span`
  font-size: 14px;
  font-weight: 600;
`;

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.span`
  color: ${s("textSecondary")};
  font-size: 13px;
  font-weight: 500;
`;

const Hint = styled.span`
  color: ${s("textTertiary")};
  font-size: 12px;
`;

const MessageInput = styled.textarea`
  min-height: 52px;
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

  &::placeholder {
    color: ${s("placeholder")};
  }
`;

const FieldRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const FieldName = styled.span`
  flex: 0 0 120px;
  overflow: hidden;
  color: ${s("textSecondary")};
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Grow = styled.div`
  flex: 1;
  min-width: 0;
`;

const AddRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  color: ${s("textTertiary")};
`;
