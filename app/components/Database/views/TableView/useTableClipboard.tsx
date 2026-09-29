import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import type { DatabaseField } from "@shared/databases/types";
import { isModKey } from "@shared/utils/keyboard";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import {
  appendChoice,
  isStatusField,
  renameStatusChoice,
} from "../../cells/choices";
import { useCellLocale } from "../../cells/hooks";
import { getCell } from "../../cells/registry";
import { saveChoices } from "../../cells/saveChoices";
import type { CopiedCells } from "./clipboard";
import {
  CELLS_MIME,
  copyCells,
  parseTsv,
  planPaste,
  readCopiedCells,
} from "./clipboard";

interface Options {
  database: Database;
  gridRef: React.RefObject<HTMLDivElement>;
  /** The selected cell, where a copy reads and a paste starts. */
  active: { recordId: string; fieldId: string } | null;
  /** The rows in the order they are shown. */
  rowIds: string[];
  /** The fields of the columns in the order they are shown. */
  fields: DatabaseField[];
  readOnly: boolean;
  onError: (err: unknown) => void;
}

/**
 * Copy and paste of table cells with the keyboard. The grid is not editable, so the browser
 * would neither copy nor paste there: the shortcut moves the focus to a hidden text area inside
 * the table for the browser's own copy or paste, then back to the grid.
 *
 * @param options the table and its selected cell.
 * @returns the hidden text area to render in the table, and the grid's key handler, which
 * returns true when it took the key.
 */
export function useTableClipboard({
  database,
  gridRef,
  active,
  rowIds,
  fields,
  readOnly,
  onError,
}: Options) {
  const { t } = useTranslation();
  const stores = useStores();
  const locale = useCellLocale();
  const bridgeRef = React.useRef<HTMLTextAreaElement>(null);
  const pendingCopy = React.useRef<{ text: string; data: string }>();

  const focusGridSoon = React.useCallback(() => {
    requestAnimationFrame(() =>
      gridRef.current?.focus({ preventScroll: true })
    );
  }, [gridRef]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent): boolean => {
      const bridge = bridgeRef.current;
      if (!bridge || !active || !isModKey(event) || event.altKey) {
        return false;
      }
      const key = event.key.toLowerCase();
      if (key === "c" && !event.shiftKey) {
        const field = fields.find((item) => item.id === active.fieldId);
        const record = stores.databaseRecords.recordById(
          database.id,
          active.recordId
        );
        if (!field || !record) {
          return false;
        }
        pendingCopy.current = copyCells(
          [[{ field, value: record.fields[field.id] }]],
          locale
        );
        // A text area copies only a selection that is not empty.
        bridge.value = pendingCopy.current.text || " ";
        bridge.focus({ preventScroll: true });
        bridge.select();
        focusGridSoon();
        return true;
      }
      if (key === "v" && !readOnly) {
        bridge.value = "";
        bridge.focus({ preventScroll: true });
        focusGridSoon();
        return true;
      }
      return false;
    },
    [active, database.id, fields, focusGridSoon, locale, readOnly, stores]
  );

  const handleCopy = React.useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const payload = pendingCopy.current;
      pendingCopy.current = undefined;
      if (!payload) {
        return;
      }
      event.preventDefault();
      event.clipboardData.setData("text/plain", payload.text);
      event.clipboardData.setData(CELLS_MIME, payload.data);
    },
    []
  );

  const paste = React.useCallback(
    async (text: string, copied: CopiedCells | undefined) => {
      if (!active || readOnly) {
        return;
      }
      const start = {
        row: rowIds.indexOf(active.recordId),
        col: fields.findIndex((field) => field.id === active.fieldId),
      };
      if (start.row === -1 || start.col === -1) {
        return;
      }
      const plan = planPaste({
        texts: parseTsv(text),
        copied,
        rowIds,
        fields,
        start,
        canWrite: (field) => {
          const cell = getCell(field.type);
          return !!cell.Editor && cell.isEditable(field);
        },
        findUser: (name) => {
          const wanted = name.toLocaleLowerCase();
          return stores.users.orderedData.find(
            (user) =>
              user.name.toLocaleLowerCase() === wanted ||
              user.email?.toLocaleLowerCase() === wanted
          )?.id;
        },
      });
      if (!plan.updates.length) {
        if (plan.skipped) {
          toast.error(t("These cells cannot take what was pasted"));
        }
        return;
      }

      const refused = new Set<string>();
      for (const [fieldId, names] of Object.entries(plan.newChoices)) {
        const field = database.fieldById(fieldId);
        const saved =
          field &&
          (await saveChoices(
            stores,
            database,
            field,
            names.reduce(appendChoice, field.options.choices ?? []),
            isStatusField(field)
              ? names.reduce(
                  (groups, name) => renameStatusChoice(groups, null, name),
                  field.meta?.statusGroups ?? {}
                )
              : undefined
          ));
        if (!saved) {
          refused.add(fieldId);
        }
      }

      const results = await Promise.allSettled(
        plan.updates.map(({ recordId, values }) => {
          const kept = Object.fromEntries(
            Object.entries(values).filter(([fieldId]) => !refused.has(fieldId))
          );
          return Object.keys(kept).length
            ? stores.databaseRecords.update(database.id, recordId, kept)
            : Promise.resolve();
        })
      );
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected"
      );
      if (failure) {
        onError(failure.reason);
      }
    },
    [active, database, fields, onError, readOnly, rowIds, stores, t]
  );

  const handlePaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      event.preventDefault();
      const text = event.clipboardData.getData("text/plain");
      const data = event.clipboardData.getData(CELLS_MIME) || undefined;
      void paste(text, readCopiedCells(text, data));
    },
    [paste]
  );

  const bridge = (
    <Bridge
      ref={bridgeRef}
      aria-hidden
      tabIndex={-1}
      onCopy={handleCopy}
      onPaste={handlePaste}
    />
  );

  return { bridge, handleKeyDown };
}

const Bridge = styled.textarea`
  position: fixed;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  padding: 0;
  border: 0;
  opacity: 0;
  pointer-events: none;
  resize: none;
`;
