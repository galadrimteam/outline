import { runInAction } from "mobx";
import type {
  DatabaseCellInput,
  DatabaseRecord,
  DatabaseRecordOrder,
} from "@shared/databases/types";
import type Database from "~/models/Database";
import type Document from "~/models/Document";
import type Template from "~/models/Template";
import { databaseRpc } from "~/stores/DatabasesStore";
import type RootStore from "~/stores/RootStore";
import type { PartialExcept } from "~/types";

/**
 * Creates a row with its page started from a template, and shows it in the
 * loaded views.
 *
 * @param stores the root store.
 * @param databaseId the database id.
 * @param templateId the template of the row's page.
 * @param fields the row's first values.
 * @param order where the row goes in a view.
 * @returns the row, whose page is in the documents store.
 */
export async function createRecordFromTemplate(
  stores: RootStore,
  databaseId: string,
  templateId: string,
  fields: Record<string, DatabaseCellInput> = {},
  order?: DatabaseRecordOrder
): Promise<DatabaseRecord> {
  const res = await databaseRpc<{
    record: DatabaseRecord;
    document: PartialExcept<Document, "id">;
  }>("/databaseRecords.createFromTemplate", {
    databaseId,
    templateId,
    fields,
    order,
  });
  const { record, document } = res.data;

  runInAction(() => {
    res.policies?.forEach((policy) => stores.policies.add(policy));
    stores.documents.add(document);
    stores.databaseRecords.noteLocalWrite(record.id);
    stores.databaseRecords.cacheRecords(databaseId, [record]);
    stores.databaseRecords.invalidate(databaseId);
  });
  return record;
}

/**
 * Lists the templates a new row of a database can start from: the published
 * templates of its collection, then the workspace's.
 *
 * @param templates the published templates.
 * @param database the database.
 * @returns the templates, collection ones first.
 */
export function rowTemplates(
  templates: Template[],
  database: Pick<Database, "collectionId">
): Template[] {
  const ofCollection = templates.filter(
    (template) =>
      !template.isWorkspaceTemplate &&
      template.collectionId === database.collectionId
  );
  const ofWorkspace = templates.filter(
    (template) => template.isWorkspaceTemplate
  );
  return [...ofCollection, ...ofWorkspace];
}

/**
 * Makes a template the one « New » starts from in a view, or goes back to an
 * empty page. The default lives in Outline's overrides of the view.
 *
 * @param stores the root store.
 * @param databaseId the database id.
 * @param viewId the view id.
 * @param templateId the template, or null for an empty page.
 */
export async function setDefaultRowTemplate(
  stores: RootStore,
  databaseId: string,
  viewId: string,
  templateId: string | null
): Promise<void> {
  if (templateId) {
    await stores.databases.updateView(databaseId, viewId, {
      overrides: { defaultTemplateId: templateId },
    });
    return;
  }
  // `DatabaseViewOverrides.defaultTemplateId` cannot be null in the store's
  // patch type, while the server removes a key given null.
  stores.databaseRecords.noteLocalWrite(viewId);
  await databaseRpc("/databaseViews.update", {
    databaseId,
    viewId,
    overrides: { defaultTemplateId: null },
  });
  await stores.databases.fetch(databaseId, { force: true });
}
