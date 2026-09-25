import type {
  DatabaseAttachmentValue,
  DatabaseCellValue,
  DatabaseField,
  DatabaseGroupPoint,
  DatabaseHistoryEntry,
  DatabaseLinkValue,
  DatabaseRecord,
  DatabaseUserValue,
  DatabaseView,
} from "@shared/databases/types";
import { layoutForViewType } from "../../utils/layouts";
import type {
  TeableCellValue,
  TeableField,
  TeableGroupPoint,
  TeableHistoryVo,
  TeableObjectValue,
  TeableRecord,
  TeableView,
} from "./types";

/**
 * Translates between Teable's API shapes and the engine-neutral types. Pure
 * functions, so that the mapping is tested without any HTTP.
 */
export class TeableMapper {
  /**
   * @param publicUrl the Teable address a browser reaches, to make attachment
   * links absolute.
   */
  constructor(private readonly publicUrl?: string) {}

  /**
   * Maps a Teable field.
   *
   * @param field the Teable field.
   * @returns the neutral field.
   */
  public field(field: TeableField): DatabaseField {
    return {
      id: field.id,
      name: field.name,
      type: field.type,
      description: field.description ?? null,
      options: field.options ?? {},
      isPrimary: !!field.isPrimary,
      isComputed: !!field.isComputed,
      isLookup: !!field.isLookup,
      cellValueType: field.cellValueType,
      isMultipleCellValue: !!field.isMultipleCellValue,
    };
  }

  /**
   * Maps a Teable view, without Outline's overrides.
   *
   * @param view the Teable view.
   * @returns the neutral view.
   */
  public view(view: TeableView): DatabaseView {
    return {
      id: view.id,
      name: view.name,
      type: view.type,
      layout: layoutForViewType(view.type),
      order: view.order ?? 0,
      description: view.description ?? null,
      filter: view.filter ?? null,
      sort: view.sort ?? null,
      group: view.group ?? null,
      columnMeta: view.columnMeta ?? {},
      options: view.options ?? {},
      overrides: {},
      isLocked: !!view.isLocked,
    };
  }

  /**
   * Maps a Teable record.
   *
   * @param record the Teable record, fields keyed by id.
   * @returns the neutral record.
   */
  public record(record: TeableRecord): DatabaseRecord {
    const fields: Record<string, DatabaseCellValue> = {};
    for (const [fieldId, value] of Object.entries(record.fields ?? {})) {
      fields[fieldId] = this.cell(value);
    }
    return {
      id: record.id,
      fields,
      createdTime: record.createdTime,
      lastModifiedTime: record.lastModifiedTime,
      createdBy: record.createdBy,
      lastModifiedBy: record.lastModifiedBy,
    };
  }

  /**
   * Maps a cell value read from Teable. Users, links and attachments are told
   * apart by the prefix of their id.
   *
   * @param value the Teable cell value.
   * @returns the neutral cell value.
   */
  public cell(value: TeableCellValue | undefined): DatabaseCellValue {
    if (value === undefined || value === null) {
      return null;
    }
    if (!Array.isArray(value)) {
      if (typeof value !== "object") {
        return value;
      }
      if (isAttachment(value)) {
        return [this.attachment(value)];
      }
      return isUser(value) ? this.user(value) : this.link(value);
    }

    const objects = value.filter(isObjectValue);
    if (objects.length && objects.length === value.length) {
      if (objects.every(isAttachment)) {
        return objects.map((item) => this.attachment(item));
      }
      if (objects.every(isUser)) {
        return objects.map((item) => this.user(item));
      }
      return objects.map((item) => this.link(item));
    }
    if (value.every((item) => typeof item === "number")) {
      return value.filter((item) => typeof item === "number");
    }
    return value.map((item) =>
      typeof item === "object" ? (item.title ?? item.id ?? "") : String(item)
    );
  }

  /**
   * Returns the Teable users a cell value refers to.
   *
   * @param value the neutral cell value.
   * @returns the Teable user ids.
   */
  public userIds(value: DatabaseCellValue | undefined): string[] {
    if (value === null || value === undefined || typeof value !== "object") {
      return [];
    }
    const items: unknown[] = Array.isArray(value) ? value : [value];
    return items.flatMap((item) =>
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      typeof item.id === "string" &&
      item.id.startsWith("usr")
        ? [item.id]
        : []
    );
  }

  /**
   * Maps a cell value to write to Teable: people and links are written by id,
   * which Teable completes (people need `typecast`).
   *
   * @param value the neutral cell value.
   * @returns the Teable cell value.
   */
  public writeCell(value: DatabaseCellValue): TeableCellValue {
    if (value === null || typeof value !== "object") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) =>
        typeof item === "object" ? writeObject(item) : item
      );
    }
    return writeObject(value);
  }

  /**
   * Maps the group points of a view.
   *
   * @param points the Teable group points.
   * @returns the neutral group points.
   */
  public groupPoints(points: TeableGroupPoint[] | null): DatabaseGroupPoint[] {
    return (points ?? []).map((point) =>
      point.type === 0
        ? {
            type: "header",
            id: point.id,
            depth: point.depth,
            value: this.cell(point.value),
            isCollapsed: point.isCollapsed,
          }
        : { type: "row", count: point.count }
    );
  }

  /**
   * Maps a page of record history.
   *
   * @param history the Teable history.
   * @returns the neutral entries.
   */
  public history(history: TeableHistoryVo): DatabaseHistoryEntry[] {
    return history.historyList.map((item) => {
      const author = history.userMap[item.createdBy];
      return {
        id: item.id,
        fieldId: item.fieldId,
        fieldName: item.after.meta.name ?? item.before.meta.name,
        fieldType: item.after.meta.type ?? item.before.meta.type,
        before: this.cell(item.before.data),
        after: this.cell(item.after.data),
        createdTime: item.createdTime,
        createdBy: author
          ? {
              id: author.id,
              title: author.name,
              email: author.email,
              avatarUrl: this.absoluteUrl(author.avatar ?? undefined) ?? null,
            }
          : null,
      };
    });
  }

  private user(value: TeableObjectValue): DatabaseUserValue {
    return {
      id: value.id ?? "",
      title: value.title ?? "",
      email: value.email,
      avatarUrl: this.absoluteUrl(value.avatarUrl ?? undefined) ?? null,
    };
  }

  private link(value: TeableObjectValue): DatabaseLinkValue {
    return { id: value.id ?? "", title: value.title };
  }

  private attachment(value: TeableObjectValue): DatabaseAttachmentValue {
    return {
      id: value.id ?? "",
      name: value.name ?? "",
      mimetype: value.mimetype ?? "",
      size: value.size ?? 0,
      width: value.width,
      height: value.height,
      url: this.absoluteUrl(value.presignedUrl),
      thumbnailUrl: this.absoluteUrl(
        value.smThumbnailUrl ?? value.lgThumbnailUrl
      ),
      token: value.token,
      path: value.path,
    };
  }

  private absoluteUrl(url: string | undefined): string | undefined {
    if (!url || !url.startsWith("/") || !this.publicUrl) {
      return url;
    }
    return `${this.publicUrl}${url}`;
  }
}

function isObjectValue(
  value: string | number | boolean | TeableObjectValue
): value is TeableObjectValue {
  return typeof value === "object" && value !== null;
}

function isUser(value: TeableObjectValue) {
  return !!value.id?.startsWith("usr");
}

function isAttachment(value: TeableObjectValue) {
  return !!value.id?.startsWith("act") || value.token !== undefined;
}

function writeObject(
  value: DatabaseUserValue | DatabaseLinkValue | DatabaseAttachmentValue
): TeableObjectValue {
  if ("mimetype" in value) {
    return {
      id: value.id,
      name: value.name,
      token: value.token,
      path: value.path,
      size: value.size,
      mimetype: value.mimetype,
      width: value.width,
      height: value.height,
    };
  }
  return { id: value.id };
}
