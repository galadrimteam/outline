import { EmailIcon, LinkIcon } from "outline-icons";
import Icon from "@shared/components/Icon";
import type { DatabaseField } from "@shared/databases/types";
import {
  DatabaseFieldType,
  DatabaseStatusGroup,
} from "@shared/databases/types";
import { FieldTypeIcon } from "../toolbar/icons";
import type { FieldKindId } from "./fieldTypes";
import { FIELD_KINDS, fieldKindOf, isEditTimeFormula } from "./fieldTypes";

interface Props {
  /** The property kind, or an existing property. */
  kind?: FieldKindId;
  field?: DatabaseField;
  size?: number;
}

/**
 * The icon of a property kind: the icon given to the property, else the type icon, with links,
 * e-mails and phones told apart from plain text, and the icons of Notion's created and edited
 * times and people on the formulas and person fields that stand for them.
 *
 * @param props the kind or the property, and the size.
 * @returns the icon.
 */
export function FieldKindIcon({ kind, field, size = 18 }: Props) {
  if (field?.meta?.icon) {
    return (
      <Icon
        value={field.meta.icon}
        initial={field.name.charAt(0).toUpperCase()}
        color="currentColor"
        size={size}
        fullSize
      />
    );
  }

  const id = kind ?? (field ? fieldKindOf(field) : undefined);

  switch (id) {
    case "url":
      return <LinkIcon size={size} />;
    case "email":
      return <EmailIcon size={size} />;
    case "phone":
      return <PhoneIcon size={size} />;
    default:
      break;
  }

  if (field?.meta?.standsFor) {
    return <FieldTypeIcon field={{ type: field.meta.standsFor }} size={size} />;
  }
  if (field && isEditTimeFormula(field)) {
    return (
      <FieldTypeIcon
        field={{ type: DatabaseFieldType.CreatedTime }}
        size={size}
      />
    );
  }
  if (field) {
    return <FieldTypeIcon field={field} size={size} />;
  }
  const type = FIELD_KINDS.find((item) => item.id === id)?.type;
  if (!type) {
    return null;
  }
  return (
    <FieldTypeIcon
      field={{
        type,
        meta:
          id === "status"
            ? { statusGroups: { "": DatabaseStatusGroup.ToDo } }
            : undefined,
      }}
      size={size}
    />
  );
}

function PhoneIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8.2 5.5c.4 0 .8.3 1 .7l1 2.4c.2.4 0 .9-.3 1.2l-1.1 1c.8 1.5 2 2.7 3.5 3.5l1-1.1c.3-.3.8-.5 1.2-.3l2.4 1c.4.2.7.6.7 1v2c0 1-.8 1.8-1.8 1.8C10.6 18.7 5.3 13.4 5.3 7.3c0-1 .8-1.8 1.8-1.8h1.1Z" />
    </svg>
  );
}
