import { computed, observable } from "mobx";
import type {
  DatabaseField,
  DatabaseSettings,
  DatabaseView,
} from "@shared/databases/types";
import type DatabasesStore from "~/stores/DatabasesStore";
import Model from "./base/Model";
import Field from "./decorators/Field";

/**
 * A database (rows shown as table, board, calendar… views) anchored to a
 * document or a collection. Its rows live in the database engine and are read
 * through `stores.databaseRecords`.
 */
export class Database extends Model {
  static modelName = "Database";

  constructor(fields: Record<string, unknown>, store: DatabasesStore) {
    super(fields, store);
    this.initialize(fields);
  }

  store: DatabasesStore;

  /** The name shown in the block header. */
  @Field
  @observable
  title: string;

  /** An emoji or icon name shown before the title. */
  @Field
  @observable
  icon: string | null;

  /** The collection the database belongs to. */
  @observable
  collectionId: string;

  /** The home document of the database, null when it spans a collection. */
  @observable
  documentId: string | null;

  /** The app path of the database, eg "/db/<id>". */
  @observable
  url: string;

  /** What Outline keeps next to the engine's schema. */
  @observable.ref
  settings: DatabaseSettings;

  /** The automations turned on, known to the people who may edit the database. */
  @observable
  automationCount: number | undefined;

  /** The columns, undefined until the schema has been fetched. */
  @observable.ref
  fields: DatabaseField[];

  /** The views, undefined until the schema has been fetched. */
  @observable.ref
  views: DatabaseView[];

  /** Whether fields and views are loaded (a database from a list has neither). */
  @computed
  get isSchemaLoaded(): boolean {
    return Array.isArray(this.fields) && Array.isArray(this.views);
  }

  /** The field whose value is a row's title. */
  @computed
  get primaryField(): DatabaseField | undefined {
    const fields = this.fields ?? [];
    return fields.find((field) => field.isPrimary) ?? fields[0];
  }

  /** Fields by id. */
  @computed
  get fieldsById(): Map<string, DatabaseField> {
    return new Map((this.fields ?? []).map((field) => [field.id, field]));
  }

  /** Views by id. */
  @computed
  get viewsById(): Map<string, DatabaseView> {
    return new Map((this.views ?? []).map((view) => [view.id, view]));
  }

  /** Views in tab order. */
  @computed
  get orderedViews(): DatabaseView[] {
    return [...(this.views ?? [])].sort((a, b) => a.order - b.order);
  }

  /**
   * Returns a view of this database.
   *
   * @param id the view id.
   * @returns the view, or undefined when unknown.
   */
  viewById(id: string): DatabaseView | undefined {
    return this.viewsById.get(id);
  }

  /**
   * Returns a field of this database.
   *
   * @param id the field id.
   * @returns the field, or undefined when unknown.
   */
  fieldById(id: string): DatabaseField | undefined {
    return this.fieldsById.get(id);
  }
}

export default Database;
