import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { highlightBlock } from "@shared/editor/commands/highlightBlock";
import { selectTextblock } from "@shared/editor/commands/selectTextblock";
import { MentionType } from "@shared/types";
import { toError } from "@shared/utils/error";
import useCurrentUser from "~/hooks/useCurrentUser";
import Logger from "~/utils/Logger";
import type { BlockMenuActions } from "../menus/block";
import { useEditor } from "./EditorContext";

/**
 * The block menu's actions that need more than an editor command: making a
 * sub-page as Notion's « /page » does, commenting on a block and painting it.
 * An action this editor cannot perform is left out.
 *
 * @returns the actions available in the current editor.
 */
export function useBlockMenuActions(): BlockMenuActions {
  const editor = useEditor();
  const { t } = useTranslation();
  const user = useCurrentUser({ rejectOnEmpty: false });
  const { onCreateLink, onClickLink, onOpenCommentsSidebar } = editor.props;
  const { commands, schema } = editor;
  const userId = user?.id;

  return useMemo(() => {
    const highlight = schema?.marks.highlight;

    const createSubPage = async (create: NonNullable<typeof onCreateLink>) => {
      const id = uuidv4();
      try {
        const url = await create({ id, title: "" }, true);
        commands.mention({
          id: uuidv4(),
          type: MentionType.Document,
          modelId: id,
          label: t("Untitled"),
          actorId: userId,
        });
        onClickLink(url);
      } catch (err) {
        Logger.error("Failed to create a sub-page", toError(err));
        toast.error(t("Couldn’t create the document, try again?"));
      }
    };

    return {
      createSubPage: onCreateLink
        ? () => void createSubPage(onCreateLink)
        : undefined,
      commentBlock: commands?.comment
        ? () => {
            const { view } = editor;
            if (selectTextblock()(view.state, view.dispatch)) {
              commands.comment();
            } else {
              onOpenCommentsSidebar?.();
            }
          }
        : undefined,
      highlightBlock: highlight
        ? (color: string | null) => {
            const { view } = editor;
            highlightBlock(highlight, color)(view.state, view.dispatch);
            view.focus();
          }
        : undefined,
    };
  }, [
    editor,
    commands,
    schema,
    onCreateLink,
    onClickLink,
    onOpenCommentsSidebar,
    t,
    userId,
  ]);
}
