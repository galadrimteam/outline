import { CheckmarkIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { FieldKindIcon } from "./FieldKindIcon";
import type { FieldKindId } from "./fieldTypes";
import { FIELD_KINDS, fieldKindLabel } from "./fieldTypes";
import { MenuHeading, MenuInput, MenuItem, MenuLabel } from "./components";

interface Props {
  /** The kind shown as current. */
  current?: FieldKindId;
  /** Called with the picked kind. */
  onPick: (kind: FieldKindId) => void;
  /** Whether to show a search box above the list. */
  searchable?: boolean;
}

/**
 * The property types to pick from, with their icons, filtered by an optional search.
 *
 * @param props the current kind and the pick callback.
 * @returns the list.
 */
export function FieldKindList({ current, onPick, searchable }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();
  const kinds = FIELD_KINDS.filter((kind) =>
    fieldKindLabel(kind.id, t).toLowerCase().includes(needle)
  );

  return (
    <div role="listbox" aria-label={t("Type")}>
      {searchable && (
        <MenuInput
          autoFocus
          placeholder={t("Search for a property type…")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter" && kinds[0]) {
              event.preventDefault();
              onPick(kinds[0].id);
            }
          }}
        />
      )}
      <MenuHeading>{t("Type")}</MenuHeading>
      {kinds.map((kind) => (
        <MenuItem
          key={kind.id}
          type="button"
          role="option"
          aria-selected={kind.id === current}
          onClick={() => onPick(kind.id)}
        >
          <FieldKindIcon kind={kind.id} />
          <MenuLabel>{fieldKindLabel(kind.id, t)}</MenuLabel>
          {kind.id === current && <CheckmarkIcon size={18} />}
        </MenuItem>
      ))}
    </div>
  );
}
