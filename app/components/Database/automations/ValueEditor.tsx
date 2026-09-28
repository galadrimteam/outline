import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import type {
  DatabaseAutomationValue,
  DatabaseAutomationValueKind,
} from "@shared/databases/automations";
import type { DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type Database from "~/models/Database";
import { CompactSelect, SmallInput } from "../toolbar/components";
import {
  defaultValueFor,
  valueKindLabel,
  valueKindsFor,
} from "./automationText";
import { CellValueField } from "./CellValueField";

interface Props {
  /** The database the field belongs to (the automation's, or the one a row is added to). */
  database: Database;
  /** The field written. */
  field: DatabaseField;
  /** The value written. */
  value: DatabaseAutomationValue;
  /** Called with the new value. */
  onChange: (value: DatabaseAutomationValue) => void;
  /** The automation's database, whose rows links can point to. */
  sourceDatabaseId: string;
}

/**
 * Picks what an action writes into a field: a value picked with the field's
 * cell editor, text with variables, today, the person who triggered, the
 * triggering row, or nothing.
 *
 * @param props the field, the value and the change callback.
 * @returns the value picker.
 */
export const ValueEditor = observer(function ValueEditor_({
  database,
  field,
  value,
  onChange,
  sourceDatabaseId,
}: Props) {
  const { t } = useTranslation();
  const kinds = valueKindsFor(field, sourceDatabaseId);
  const options = kinds.map((kind) => ({
    value: kind,
    label: valueKindLabel(kind, t),
  }));

  const handleKindChange = React.useCallback(
    (kind: DatabaseAutomationValueKind) => {
      if (kind === value.kind) {
        return;
      }
      const preset = defaultValueFor(field, sourceDatabaseId);
      if (kind === preset.kind) {
        onChange(preset);
      } else if (kind === "static") {
        onChange({ kind, value: null });
      } else if (kind === "template") {
        onChange({ kind, text: "" });
      } else {
        onChange({ kind });
      }
    },
    [field, onChange, sourceDatabaseId, value.kind]
  );

  return (
    <Row>
      {kinds.length > 1 && (
        <CompactSelect
          value={value.kind}
          options={options}
          onChange={handleKindChange}
          ariaLabel={t("Value to write")}
          width={170}
        />
      )}
      {value.kind === "static" && (
        <Grow>
          <CellValueField
            database={database}
            field={field}
            value={value.value}
            label={field.name}
            onChange={(next) => onChange({ kind: "static", value: next })}
          />
        </Grow>
      )}
      {value.kind === "template" && (
        <Grow>
          <SmallInput
            value={value.text}
            aria-label={field.name}
            placeholder={
              field.type === DatabaseFieldType.Number
                ? t("A number")
                : t("Text, variables like {{ example }} allowed", {
                    example: "{{title}}",
                  })
            }
            onChange={(event) =>
              onChange({ kind: "template", text: event.target.value })
            }
            style={{ width: "100%" }}
          />
        </Grow>
      )}
      {kinds.length === 1 &&
        value.kind !== "static" &&
        value.kind !== "template" && (
          <Fixed>{valueKindLabel(value.kind, t)}</Fixed>
        )}
    </Row>
  );
});

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
`;

const Grow = styled.div`
  flex: 1;
  min-width: 0;
`;

const Fixed = styled.span`
  font-size: 14px;
`;
