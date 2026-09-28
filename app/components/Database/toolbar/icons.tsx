import {
  AlignLeftIcon,
  AttachmentIcon,
  CalendarIcon,
  CaseSensitiveIcon,
  CheckboxIcon,
  ClockIcon,
  DoneIcon,
  HashtagIcon,
  LinkIcon,
  MathIcon,
  ProfileIcon,
  SearchIcon,
  StarredIcon,
  TargetIcon,
  UserIcon,
  BulletedListIcon,
  DisclosureIcon,
} from "outline-icons";
import type { DatabaseField } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";

interface IconProps {
  /** Size in pixels, 24 by default like outline-icons. */
  size?: number;
}

/**
 * Funnel icon of the filter button.
 *
 * @param props the icon props.
 * @returns the icon.
 */
export function FilterIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 7a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1Zm2.5 5a1 1 0 0 1 1-1h7a1 1 0 1 1 0 2h-7a1 1 0 0 1-1-1Zm3 4a1 1 0 0 0 0 2h3a1 1 0 1 0 0-2h-3Z" />
    </svg>
  );
}

/**
 * Stacked rows icon of the group button.
 *
 * @param props the icon props.
 * @returns the icon.
 */
export function GroupByIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 5h12a1 1 0 1 1 0 2H6a1 1 0 0 1 0-2Zm2 4h10a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2Zm-2 4h12a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2Zm2 4h10a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2Z" />
    </svg>
  );
}

/**
 * Sliders icon of the properties button.
 *
 * @param props the icon props.
 * @returns the icon.
 */
export function PropertiesIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 5a3 3 0 0 1 2.83 2H19a1 1 0 1 1 0 2h-7.17A3 3 0 1 1 9 5Zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM5 8a1 1 0 0 1 1-1v2a1 1 0 0 1-1-1Zm10 3a3 3 0 1 1-2.83 4H5a1 1 0 1 1 0-2h7.17A3 3 0 0 1 15 11Zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm4 1a1 1 0 0 1-1 1v-2a1 1 0 0 1 1 1Z" />
    </svg>
  );
}

/**
 * Six dots handle shown on draggable rows.
 *
 * @param props the icon props.
 * @returns the icon.
 */
export function DragHandleIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="6" cy="4" r="1.2" />
      <circle cx="10" cy="4" r="1.2" />
      <circle cx="6" cy="8" r="1.2" />
      <circle cx="10" cy="8" r="1.2" />
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="10" cy="12" r="1.2" />
    </svg>
  );
}

/**
 * Returns the icon of a field type, shown next to field names in menus.
 *
 * @param props the field and the icon size.
 * @returns the icon.
 */
export function FieldTypeIcon({
  field,
  size = 18,
}: {
  field: Pick<DatabaseField, "type" | "meta">;
  size?: number;
}) {
  switch (field.type) {
    case DatabaseFieldType.SingleLineText:
      return <CaseSensitiveIcon size={size} />;
    case DatabaseFieldType.LongText:
      return <AlignLeftIcon size={size} />;
    case DatabaseFieldType.Number:
    case DatabaseFieldType.AutoNumber:
      return <HashtagIcon size={size} />;
    case DatabaseFieldType.Rating:
      return <StarredIcon size={size} />;
    case DatabaseFieldType.Checkbox:
      return <CheckboxIcon checked size={size} />;
    case DatabaseFieldType.SingleSelect:
      return field.meta?.statusGroups ? (
        <DoneIcon size={size} />
      ) : (
        <DisclosureIcon size={size} />
      );
    case DatabaseFieldType.MultipleSelect:
      return <BulletedListIcon size={size} />;
    case DatabaseFieldType.Date:
      return <CalendarIcon size={size} />;
    case DatabaseFieldType.User:
      return <UserIcon size={size} />;
    case DatabaseFieldType.CreatedBy:
    case DatabaseFieldType.LastModifiedBy:
      return <ProfileIcon size={size} />;
    case DatabaseFieldType.Attachment:
      return <AttachmentIcon size={size} />;
    case DatabaseFieldType.Link:
      return <LinkIcon size={size} />;
    case DatabaseFieldType.Rollup:
    case DatabaseFieldType.ConditionalRollup:
      return <SearchIcon size={size} />;
    case DatabaseFieldType.Formula:
      return <MathIcon size={size} />;
    case DatabaseFieldType.CreatedTime:
    case DatabaseFieldType.LastModifiedTime:
      return <ClockIcon size={size} />;
    case DatabaseFieldType.Button:
      return <TargetIcon size={size} />;
  }
}
