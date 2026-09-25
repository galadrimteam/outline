import { observer } from "mobx-react";
import { DocumentIcon, ExpandedIcon, NewDocumentIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import type { DatabaseCellInput, DatabaseView } from "@shared/databases/types";
import { s } from "@shared/styles";
import Icon from "@shared/components/Icon";
import { TextHelper } from "@shared/utils/TextHelper";
import {
  ActionSeparator,
  createAction,
  createActionWithChildren,
} from "~/actions";
import { DropdownMenu } from "~/components/Menu/DropdownMenu";
import useCurrentUser from "~/hooks/useCurrentUser";
import { useMenuAction } from "~/hooks/useMenuAction";
import useStores from "~/hooks/useStores";
import type Database from "~/models/Database";
import type Template from "~/models/Template";
import {
  createRecordFromTemplate,
  rowTemplates,
  setDefaultRowTemplate,
} from "./rowTemplates";

interface Props {
  /** The database the row is added to. */
  database: Database;
  /** The view « New » is used in, which may name a default template. */
  view: DatabaseView;
  /** Whether the reader may change the view, and so its default template. */
  canEditView: boolean;
  /** The first values of a row created in this view, eg its first board column. */
  defaults?: Record<string, DatabaseCellInput>;
  /** Creates an empty row and opens it. */
  onCreateEmpty: () => void | Promise<void>;
  /** Opens the page of a row just created from a template. */
  onOpenRecord: (recordId: string) => void | Promise<void>;
}

/**
 * Notion's « New ▾ » split button: the button creates a row from the view's
 * default template (an empty page when there is none), the arrow lists the
 * templates of the collection and the workspace, « Empty page », and a way to
 * make one of them the default of the view.
 *
 * @param props the database, the view and the creation callbacks.
 * @returns the split button.
 */
export const NewRecordMenu = observer(function NewRecordMenu_({
  database,
  view,
  canEditView,
  defaults,
  onCreateEmpty,
  onOpenRecord,
}: Props) {
  const { t } = useTranslation();
  const stores = useStores();
  const user = useCurrentUser();
  const [isCreating, setIsCreating] = React.useState(false);
  const published = stores.templates.published;
  const templates = React.useMemo(
    () => rowTemplates(published, database),
    [published, database]
  );
  const defaultTemplateId = view.overrides.defaultTemplateId;

  const handleCreate = React.useCallback(
    async (templateId: string | undefined) => {
      setIsCreating(true);
      try {
        if (!templateId) {
          await onCreateEmpty();
          return;
        }
        const record = await createRecordFromTemplate(
          stores,
          database.id,
          templateId,
          defaults
        );
        await onOpenRecord(record.id);
      } catch (_err) {
        toast.error(t("Couldn’t create the row"));
      } finally {
        setIsCreating(false);
      }
    },
    [stores, database.id, defaults, onCreateEmpty, onOpenRecord, t]
  );

  const handleSetDefault = React.useCallback(
    (templateId: string | null) => {
      setDefaultRowTemplate(stores, database.id, view.id, templateId).catch(
        () => toast.error(t("Couldn’t change the default template"))
      );
    },
    [stores, database.id, view.id, t]
  );

  const handleOpen = React.useCallback(() => {
    void stores.templates.fetchAll().catch(() => undefined);
  }, [stores.templates]);

  const templateName = React.useCallback(
    (template: Template) =>
      TextHelper.replaceTemplateVariables(template.titleWithDefault, user),
    [user]
  );

  const actions = React.useMemo(
    () => [
      ...templates.map((template) =>
        createAction({
          name: templateName(template),
          section: "Database",
          icon: <TemplateIcon template={template} />,
          perform: () => void handleCreate(template.id),
        })
      ),
      createAction({
        name: t("Empty page"),
        section: "Database",
        icon: <DocumentIcon />,
        perform: () => void handleCreate(undefined),
      }),
      ActionSeparator,
      createActionWithChildren({
        name: t("Set as default for this view"),
        section: "Database",
        icon: <NewDocumentIcon />,
        visible: canEditView,
        children: [
          createAction({
            name: t("Empty page"),
            section: "Database",
            selected: !defaultTemplateId,
            perform: () => handleSetDefault(null),
          }),
          ...templates.map((template) =>
            createAction({
              name: templateName(template),
              section: "Database",
              selected: template.id === defaultTemplateId,
              perform: () => handleSetDefault(template.id),
            })
          ),
        ],
      }),
    ],
    [
      templates,
      templateName,
      handleCreate,
      handleSetDefault,
      canEditView,
      defaultTemplateId,
      t,
    ]
  );
  const menu = useMenuAction(actions);

  return (
    <Split>
      <Main
        type="button"
        disabled={isCreating}
        onClick={() => void handleCreate(defaultTemplateId ?? undefined)}
      >
        {t("New")}
      </Main>
      <DropdownMenu
        action={menu}
        align="end"
        ariaLabel={t("New from template")}
        onOpen={handleOpen}
      >
        <Arrow
          type="button"
          disabled={isCreating}
          aria-label={t("New from template")}
        >
          <ExpandedIcon size={18} />
        </Arrow>
      </DropdownMenu>
    </Split>
  );
});

function TemplateIcon({ template }: { template: Template }) {
  if (!template.icon) {
    return <DocumentIcon />;
  }
  return (
    <Icon
      value={template.icon}
      initial={template.initial}
      color={template.color ?? undefined}
    />
  );
}

const Split = styled.div`
  display: inline-flex;
  align-items: stretch;
  height: 28px;
  margin-left: 4px;
  border-radius: 6px;
  overflow: hidden;
  background: ${s("accent")};
  color: ${s("accentText")};
`;

const Main = styled.button`
  padding: 0 8px 0 10px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: var(--pointer);
  transition: background 100ms ease-in-out;

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.08);
  }

  &:focus-visible {
    outline: 2px solid ${s("accentText")};
    outline-offset: -2px;
  }

  &:disabled {
    cursor: default;
    opacity: 0.8;
  }
`;

const Arrow = styled(Main)`
  display: inline-flex;
  align-items: center;
  padding: 0 4px;
  border-left: 1px solid rgba(255, 255, 255, 0.3);

  svg {
    fill: currentColor;
  }
`;
