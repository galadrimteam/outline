import * as React from "react";
import { useTranslation } from "react-i18next";
import type {
  DatabaseField,
  DatabaseGroupPoint,
  DatabaseLinkValue,
  DatabaseRecord,
} from "@shared/databases/types";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import { useDebouncedValue } from "../cells/hooks";
import { useDatabaseShare } from "../useDatabaseShare";
import type { PickerOption } from "./filterCandidates";
import {
  candidateKind,
  choiceOptions,
  fieldValues,
  linkOptions,
  peopleOptions,
} from "./filterCandidates";

interface Params {
  /** The database of the rule. */
  database: Database;
  /** The field of the rule. */
  field: DatabaseField;
  /** The view filtered, whose rows are grouped by the field to find its values; none in automations. */
  viewId?: string;
  /** Loaded rows, whose values are offered at once. */
  records: DatabaseRecord[];
  /** What the reader typed in the picker. */
  search: string;
}

/**
 * Returns the values a filter rule offers for a select, a person or a
 * relation: the options of a select; for people « Me », everyone found in
 * the rows and the members of the team; for relations the rows found in the
 * rows and the linked table's rows. People and relations are looked up on
 * the server, over every row and not only the loaded ones, and follow the
 * search.
 *
 * @param params the rule, its view, the loaded rows and the search.
 * @returns the options, or undefined when the value is typed.
 */
export function useFilterOptions({
  database,
  field,
  viewId,
  records,
  search,
}: Params): PickerOption[] | undefined {
  const { t } = useTranslation();
  const { databaseRecords, policies, users } = useStores();
  const share = useDatabaseShare();
  const kind = candidateKind(field);
  const settledSearch = useDebouncedValue(search.trim());
  const canEdit = !share.isShare && !!policies.abilities(database.id).update;
  const [points, setPoints] = React.useState<DatabaseGroupPoint[]>([]);
  const [candidates, setCandidates] = React.useState<DatabaseLinkValue[]>([]);

  React.useEffect(() => {
    if (!viewId || (kind !== "person" && kind !== "link")) {
      return;
    }
    let cancelled = false;
    databaseRecords
      .groups(database.id, viewId, {
        groupBy: [{ fieldId: field.id, order: "asc" }],
      })
      .then((next) => {
        if (!cancelled) {
          setPoints(next);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [database.id, databaseRecords, field.id, kind, viewId]);

  React.useEffect(() => {
    if (kind !== "person" || share.isShare) {
      return;
    }
    users.fetchPage({ query: settledSearch, limit: 25 }).catch(() => undefined);
  }, [kind, settledSearch, share.isShare, users]);

  React.useEffect(() => {
    if (kind !== "link" || !canEdit) {
      return;
    }
    let cancelled = false;
    databaseRecords
      .linkCandidates(database.id, field.id, {
        search: settledSearch || undefined,
        limit: 50,
      })
      .then((next) => {
        if (!cancelled) {
          setCandidates(next);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [canEdit, database.id, databaseRecords, field.id, kind, settledSearch]);

  switch (kind) {
    case "choice":
      return choiceOptions(field);
    case "person": {
      const members = share.isShare
        ? []
        : users
            .findByQuery(search, { maxResults: 25 })
            .filter((user) => !user.isSuspended)
            .map((user) => ({
              id: user.id,
              name: user.name,
              avatarUrl: user.avatarUrl,
            }));
      return peopleOptions(
        fieldValues(field, records, points),
        members,
        t("Me")
      );
    }
    case "link":
      return linkOptions(fieldValues(field, records, points), candidates);
    default:
      return undefined;
  }
}
