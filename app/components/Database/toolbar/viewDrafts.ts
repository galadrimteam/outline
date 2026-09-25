import { action, makeObservable, observable } from "mobx";
import type { FilterableField } from "@shared/databases/filters";
import {
  filtersEqual,
  normalizeFilter,
  sanitizeFilter,
} from "@shared/databases/filters";
import type {
  DatabaseFilter,
  DatabaseSort,
  DatabaseView,
} from "@shared/databases/types";

/**
 * A reader's unsaved filter and sort of one view. A key left undefined keeps
 * the view's own; null clears it.
 */
export interface ViewDraft {
  /** The whole filter being edited by someone who may save it. */
  filter?: DatabaseFilter | null;
  /** Rules added by someone who may not save: the engine ANDs them with the view's. */
  extraFilter?: DatabaseFilter | null;
  /** The whole sort being edited; it replaces the view's. */
  sort?: DatabaseSort | null;
}

/** Temporary filter and sort to pass to `stores.databaseRecords.query`. */
export interface ViewQueryParams {
  filter?: DatabaseFilter;
  sort?: DatabaseSort;
}

/** What the helpers need from the database model. */
export interface DraftDatabase {
  id: string;
  fieldById(id: string): FilterableField | undefined;
}

/**
 * Unsaved filters and sorts, per database view, for the current page session.
 * Like Notion, changing a filter or a sort never writes the view: someone who
 * may update it gets "Save for everyone", anyone gets "Reset".
 */
class ViewDraftsStore {
  @observable
  drafts = observable.map<string, ViewDraft>();

  constructor() {
    makeObservable(this);
  }

  /**
   * Returns the draft of a view.
   *
   * @param databaseId the database id.
   * @param viewId the view id.
   * @returns the draft, undefined when the view is shown as saved.
   */
  get(databaseId: string, viewId: string): ViewDraft | undefined {
    return this.drafts.get(draftKey(databaseId, viewId));
  }

  /**
   * Merges keys into the draft of a view.
   *
   * @param databaseId the database id.
   * @param viewId the view id.
   * @param patch the keys to set.
   */
  @action
  set(databaseId: string, viewId: string, patch: ViewDraft) {
    const key = draftKey(databaseId, viewId);
    this.drafts.set(key, { ...this.drafts.get(key), ...patch });
  }

  /**
   * Drops the draft of a view, which shows the saved view again.
   *
   * @param databaseId the database id.
   * @param viewId the view id.
   */
  @action
  reset(databaseId: string, viewId: string) {
    this.drafts.delete(draftKey(databaseId, viewId));
  }
}

/** The unsaved filters and sorts of every view on the page. */
export const viewDrafts = new ViewDraftsStore();

/**
 * Whether changes to the filter and sort of a view can be saved for everyone.
 *
 * @param view the view.
 * @param readOnly whether the reader may only look at the database.
 * @returns true when the reader may update the view and it is not locked.
 */
export function canSaveView(view: DatabaseView, readOnly: boolean): boolean {
  return !readOnly && !view.isLocked;
}

/**
 * Returns the sort shown for a view: the draft's when set, else the view's.
 *
 * @param view the view.
 * @param draft the draft of the view.
 * @returns the sort, or null.
 */
export function draftSort(
  view: DatabaseView,
  draft: ViewDraft | undefined
): DatabaseSort | null {
  return draft?.sort !== undefined ? draft.sort : view.sort;
}

/**
 * Returns the filter being edited: the whole filter for someone who may save,
 * the extra rules for anyone else.
 *
 * @param view the view.
 * @param draft the draft of the view.
 * @param canSave whether the reader may save the view.
 * @returns the filter, or null.
 */
export function draftFilter(
  view: DatabaseView,
  draft: ViewDraft | undefined,
  canSave: boolean
): DatabaseFilter | null {
  if (!canSave) {
    return draft?.extraFilter ?? null;
  }
  return draft?.filter !== undefined ? draft.filter : view.filter;
}

/**
 * Whether two sorts order rows the same way.
 *
 * @param a a sort.
 * @param b another sort.
 * @returns true when equal, an empty sort being the same as none.
 */
export function sortsEqual(
  a: DatabaseSort | null | undefined,
  b: DatabaseSort | null | undefined
): boolean {
  const normalize = (sort: DatabaseSort | null | undefined) =>
    sort?.sortObjs.length
      ? JSON.stringify({
          sortObjs: sort.sortObjs,
          manualSort: !!sort.manualSort,
        })
      : null;
  return normalize(a) === normalize(b);
}

/**
 * Whether the filter of a view differs from the saved one.
 *
 * @param view the view.
 * @param draft the draft of the view.
 * @param canSave whether the reader may save the view.
 * @returns true when there is something to reset.
 */
export function isFilterDirty(
  view: DatabaseView,
  draft: ViewDraft | undefined,
  canSave: boolean
): boolean {
  if (!canSave) {
    return !!normalizeFilter(draft?.extraFilter);
  }
  return !filtersEqual(draftFilter(view, draft, true), view.filter);
}

/**
 * Whether the sort of a view differs from the saved one.
 *
 * @param view the view.
 * @param draft the draft of the view.
 * @returns true when there is something to reset.
 */
export function isSortDirty(
  view: DatabaseView,
  draft: ViewDraft | undefined
): boolean {
  return !sortsEqual(draftSort(view, draft), view.sort);
}

/**
 * Returns the temporary filter and sort of a view, ready for
 * `stores.databaseRecords.query(database.id, view.id, params)`. Read inside an
 * observer: the query follows every change of the draft.
 *
 * @param database the database.
 * @param view the view.
 * @param readOnly whether the reader may only look at the database.
 * @returns the params, empty when the view is shown as saved.
 */
export function viewQueryParams(
  database: DraftDatabase,
  view: DatabaseView,
  readOnly: boolean
): ViewQueryParams {
  const draft = viewDrafts.get(database.id, view.id);
  if (!draft) {
    return {};
  }

  const canSave = canSaveView(view, readOnly);
  const params: ViewQueryParams = {};
  const fieldById = (id: string) => database.fieldById(id);

  if (isFilterDirty(view, draft, canSave)) {
    const filter = sanitizeFilter(draftFilter(view, draft, canSave), fieldById);
    if (filter) {
      params.filter = filter;
    }
  }

  if (isSortDirty(view, draft)) {
    params.sort = draftSort(view, draft) ?? { sortObjs: [] };
  }

  return params;
}

function draftKey(databaseId: string, viewId: string) {
  return `${databaseId}:${viewId}`;
}
