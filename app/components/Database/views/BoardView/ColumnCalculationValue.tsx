import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { DatabaseView } from "@shared/databases/types";
import type Database from "~/models/Database";
import type { RecordQuery } from "~/stores/DatabaseRecordsStore";
import { statisticKey } from "~/stores/DatabaseRecordsStore";
import { useCellLocale } from "../../cells/hooks";
import { formatStatistic } from "../TableView/statistics";
import { columnCalculation, columnValue } from "./groupCalculation";

interface Props {
  database: Database;
  view: DatabaseView;
  /** The rows of the column. */
  query: RecordQuery;
}

/**
 * The calculation of a board column, like Notion's next to the group's name:
 * the number of cards, a calculation over a property of its cards, or nothing.
 * A calculation is asked to the server a moment after the column changes; the
 * last answer stays shown meanwhile.
 */
export const ColumnCalculationValue = observer(function ColumnCalculationValue({
  database,
  view,
  query,
}: Props) {
  const { t } = useTranslation();
  const locale = useCellLocale();
  const calculation = columnCalculation(database, view);
  const fieldId =
    calculation.kind === "field" ? calculation.field.id : undefined;
  const func = calculation.kind === "field" ? calculation.func : undefined;
  const { total, recordIds } = query;

  React.useEffect(() => {
    if (!fieldId || !func) {
      return;
    }
    const timeout = setTimeout(() => {
      query.aggregate({ [fieldId]: func }).catch(() => undefined);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, fieldId, func, total, recordIds]);

  if (calculation.kind === "none" || !query.isLoaded) {
    return null;
  }
  if (calculation.kind === "count") {
    return <>{total}</>;
  }
  const key = statisticKey(calculation.field.id, calculation.func);
  if (!query.statistics.has(key)) {
    return null;
  }
  return (
    <>
      {formatStatistic(
        calculation.func,
        columnValue(calculation.func, query.statistics.get(key) ?? null),
        calculation.field,
        t,
        locale
      )}
    </>
  );
});
