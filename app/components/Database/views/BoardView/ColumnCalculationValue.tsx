import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { DatabaseView } from "@shared/databases/types";
import type Database from "~/models/Database";
import type { RecordQuery } from "~/stores/DatabaseRecordsStore";
import { useCellLocale } from "../../cells/hooks";
import { formatStatistic } from "../TableView/statistics";
import { columnCalculation } from "./groupCalculation";

interface Props {
  database: Database;
  view: DatabaseView;
  /** The rows of the column. */
  query: RecordQuery;
}

/**
 * The calculation of a board column, like Notion's next to the group's name:
 * the number of cards, a calculation over a property of its cards, or nothing.
 * A calculation is asked to the server, a moment after the column changes.
 */
export const ColumnCalculationValue = observer(function ColumnCalculationValue({
  database,
  view,
  query,
}: Props) {
  const { t } = useTranslation();
  const locale = useCellLocale();
  const calculation = columnCalculation(database, view);
  const [value, setValue] = React.useState<number | string | null>(null);
  const fieldId =
    calculation.kind === "field" ? calculation.field.id : undefined;
  const func = calculation.kind === "field" ? calculation.func : undefined;
  const { total, recordIds } = query;

  React.useEffect(() => {
    if (!fieldId || !func) {
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      query
        .aggregate({ [fieldId]: func })
        .then((results) => {
          if (!cancelled) {
            setValue(results[fieldId]?.value ?? null);
          }
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, fieldId, func, total, recordIds]);

  if (calculation.kind === "none" || !query.isLoaded) {
    return null;
  }
  if (calculation.kind === "count") {
    return <>{total}</>;
  }
  return (
    <>
      {formatStatistic(calculation.func, value, calculation.field, t, locale)}
    </>
  );
});
