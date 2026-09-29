import { cloneDeep, debounce, isEqual } from "es-toolkit/compat";
import { reaction, runInAction } from "mobx";
import { Node } from "prosemirror-model";
import type { Selection } from "prosemirror-state";
import { AllSelection, TextSelection } from "prosemirror-state";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "sonner";
import { errToString } from "@shared/utils/error";
import { ProsemirrorHelper } from "@shared/utils/ProsemirrorHelper";
import { TextHelper } from "@shared/utils/TextHelper";
import type Document from "~/models/Document";
import Template from "~/models/Template";
import type Revision from "~/models/Revision";
import type { Editor as TEditor } from "~/editor";
import useIsMounted from "~/hooks/useIsMounted";
import { useLocationSidebarContext } from "~/hooks/useLocationSidebarContext";
import useStores from "~/hooks/useStores";
import { documentEditPath } from "~/utils/routeHelpers";

const AUTOSAVE_DELAY = 3000;

interface UseDocumentSaveOptions {
  /** The document model being edited. */
  document: Document;
  /** Ref to the editor instance. */
  editorRef: React.RefObject<TEditor | null>;
  /** Whether the document is currently in read-only mode. */
  readOnly: boolean;
}

interface UseDocumentSaveResult {
  isUploading: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  isEditorDirty: boolean;
  isEmpty: boolean;
  onSave: (options?: {
    done?: boolean;
    publish?: boolean;
    autosave?: boolean;
  }) => Promise<void>;
  replaceSelection: (
    template: Template | Revision,
    selection?: Selection
  ) => Promise<void> | undefined;
  handleSelectTemplate: (
    template: Template | Revision
  ) => Promise<void> | undefined;
  handleChangeTitle: (value: string) => void;
  handleChangeIcon: (icon: string | null, color: string | null) => void;
  onFileUploadStart: () => void;
  onFileUploadStop: () => void;
}

/** What the title editor does with a title the document got from elsewhere. */
export type IncomingTitleAction = "ignore" | "adopt" | "keep" | "keepAndSave";

/**
 * Decides what becomes of a document title that changed without being typed
 * here: a rename by someone else or by a database row, or the server's answer
 * to a save. Nothing typed may be lost, and a title nobody is typing follows
 * the server; the server trims titles, so spaces at the ends do not count.
 *
 * @param incoming the document's new title.
 * @param typed the title as typed in this editor.
 * @param saved the last title this editor saved or took from the server.
 * @returns "adopt" to show the incoming title, "keep" to put the typed one
 * back, "keepAndSave" to put it back and save it, "ignore" when they agree.
 */
export function incomingTitleAction({
  incoming,
  typed,
  saved,
}: {
  incoming: string;
  typed: string;
  saved: string;
}): IncomingTitleAction {
  if (incoming === typed) {
    return "ignore";
  }
  if (incoming.trim() === typed.trim()) {
    return "keep";
  }
  return typed.trim() === saved.trim() ? "adopt" : "keepAndSave";
}

export function shouldAutoDeleteDraftOnUnmount({
  isEditorEmpty,
  title,
  createdById,
  currentUserId,
  isDraft,
  isActive,
  hasEmptyTitle,
  isPersistedOnce,
}: {
  isEditorEmpty: boolean;
  title: string;
  createdById?: string;
  currentUserId?: string;
  isDraft: boolean;
  isActive: boolean;
  hasEmptyTitle: boolean;
  isPersistedOnce: boolean;
}) {
  return (
    isEditorEmpty &&
    title.trim() === "" &&
    createdById === currentUserId &&
    isDraft &&
    isActive &&
    hasEmptyTitle &&
    isPersistedOnce
  );
}

/**
 * Hook that encapsulates save, autosave, dirty-tracking, and template
 * insertion logic for the document editor scene.
 *
 * @param options - the document, editor ref, and readOnly flag.
 * @returns state values and callbacks for save/dirty management.
 */
export function useDocumentSave({
  document,
  editorRef,
  readOnly,
}: UseDocumentSaveOptions): UseDocumentSaveResult {
  const { auth, ui } = useStores();
  const history = useHistory();
  const sidebarContext = useLocationSidebarContext();
  const isMounted = useIsMounted();

  // State
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [title, setTitle] = useState(document.title);

  // Companion refs for stale closure avoidance
  const isEditorDirtyRef = useRef(isEditorDirty);
  isEditorDirtyRef.current = isEditorDirty;
  const titleRef = useRef(title);
  titleRef.current = title;
  const savedTitleRef = useRef(document.title);

  const updateIsDirty = useCallback(() => {
    const doc = editorRef.current?.view.state.doc;
    const dirty = !isEqual(doc?.toJSON(), document.data);
    setIsEditorDirty(dirty);
    isEditorDirtyRef.current = dirty;
    const empty = (!doc || ProsemirrorHelper.isEmpty(doc)) && !titleRef.current;
    setIsEmpty(empty);
  }, [document, editorRef]);

  const updateIsDirtyRef = useRef(updateIsDirty);
  useEffect(() => {
    updateIsDirtyRef.current = updateIsDirty;
  });

  const onSave = useCallback(
    async (
      options: {
        done?: boolean;
        publish?: boolean;
        autosave?: boolean;
      } = {}
    ) => {
      // prevent saves when we are already saving
      if (document.isSaving) {
        return;
      }

      // get the latest version of the editor text value
      const doc = editorRef.current?.view.state.doc;
      if (!doc) {
        return;
      }

      // prevent save before anything has been written (single hash is empty doc)
      if (ProsemirrorHelper.isEmpty(doc) && document.title.trim() === "") {
        return;
      }

      document.data = doc.toJSON();
      document.tasks = ProsemirrorHelper.getTasksSummary(doc);

      // prevent autosave if nothing has changed
      if (
        options.autosave &&
        !isEditorDirtyRef.current &&
        !document.isDirty() &&
        titleRef.current.trim() === savedTitleRef.current.trim()
      ) {
        return;
      }

      setIsSaving(true);
      setIsPublishing(!!options.publish);
      const sentTitle = document.title;

      try {
        const savedDocument = await document.save(undefined, options);
        savedTitleRef.current = sentTitle;
        isEditorDirtyRef.current = false;
        if (isMounted()) {
          setIsEditorDirty(false);
        }

        if (options.done) {
          history.push({
            pathname: savedDocument.url,
            state: { sidebarContext },
          });
          ui.setActiveDocument(savedDocument);
        } else if (document.isNew) {
          history.push({
            pathname: documentEditPath(savedDocument),
            state: { sidebarContext },
          });
          ui.setActiveDocument(savedDocument);
        }
      } catch (err) {
        toast.error(errToString(err));
      } finally {
        if (isMounted()) {
          setIsSaving(false);
          setIsPublishing(false);
        }
      }
    },
    [document, editorRef, history, sidebarContext, ui, isMounted]
  );

  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  });

  const autosave = useMemo(
    () =>
      debounce(
        () =>
          void onSaveRef.current({
            done: false,
            autosave: true,
          }),
        AUTOSAVE_DELAY
      ),
    []
  );

  // galadrim: the title can change under the editor (another person's rename,
  // the title of a database row set from its table, a save's answer landing
  // while typing). Show it unless something typed here is not saved yet.
  useEffect(
    () =>
      reaction(
        () => document.title,
        (incoming) => {
          const typed = titleRef.current;
          const action = incomingTitleAction({
            incoming,
            typed,
            saved: savedTitleRef.current,
          });
          if (action === "adopt") {
            setTitle(incoming);
            titleRef.current = incoming;
            savedTitleRef.current = incoming;
            updateIsDirtyRef.current();
            return;
          }
          if (action === "keep" || action === "keepAndSave") {
            runInAction(() => {
              document.title = typed;
            });
          }
          if (action === "keepAndSave") {
            autosave();
          }
        }
      ),
    [document, autosave]
  );

  /**
   * Replaces the given selection with a template, if no selection is provided
   * then the template is inserted at the beginning of the document.
   *
   * @param template the template to use.
   * @param selection the selection to replace, if any.
   */
  const replaceSelection = useCallback(
    (template: Template | Revision, selection?: Selection) => {
      const editor = editorRef.current;

      if (!editor) {
        return;
      }

      const { view, schema } = editor;
      const sel = selection ?? TextSelection.near(view.state.doc.resolve(0));
      const doc = Node.fromJSON(
        schema,
        ProsemirrorHelper.replaceTemplateVariables(template.data, auth.user!)
      );

      if (doc) {
        view.dispatch(
          view.state.tr.setSelection(sel).replaceSelectionWith(doc)
        );
      }

      setIsEditorDirty(true);
      isEditorDirtyRef.current = true;

      if (template instanceof Template) {
        document.templateId = template.id;
        document.fullWidth = template.fullWidth;
      }

      if (!titleRef.current) {
        const newTitle = TextHelper.replaceTemplateVariables(
          template.title,
          auth.user!
        );
        setTitle(newTitle);
        titleRef.current = newTitle;
        document.title = newTitle;
      }
      if (template.icon) {
        document.icon = template.icon;
      }
      if (template.color) {
        document.color = template.color;
      }

      document.data = cloneDeep(template.data);
      updateIsDirtyRef.current();

      return onSaveRef.current({
        autosave: true,
        publish: false,
        done: false,
      });
    },
    [auth, document, editorRef]
  );

  const handleSelectTemplate = useCallback(
    async (template: Template | Revision) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const { view } = editor;
      const doc = view.state.doc;

      return replaceSelection(
        template,
        ProsemirrorHelper.isEmpty(doc)
          ? new AllSelection(doc)
          : view.state.selection
      );
    },
    [editorRef, replaceSelection]
  );

  const onFileUploadStart = useCallback(() => {
    setIsUploading(true);
  }, []);

  const onFileUploadStop = useCallback(() => {
    setIsUploading(false);
  }, []);

  const handleChangeTitle = useCallback(
    (value: string) => {
      setTitle(value);
      titleRef.current = value;
      document.title = value;
      updateIsDirtyRef.current();
      autosave();
    },
    [document, autosave]
  );

  const handleChangeIcon = useCallback(
    (icon: string | null, color: string | null) => {
      document.icon = icon;
      document.color = color;
      void onSaveRef.current();
    },
    [document]
  );

  // Initial dirty check on mount
  useEffect(() => {
    updateIsDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When readOnly changes from true to false, recalculate dirty state
  const prevReadOnlyRef = useRef(readOnly);
  useEffect(() => {
    if (prevReadOnlyRef.current && !readOnly) {
      updateIsDirty();
    }
    prevReadOnlyRef.current = readOnly;
  }, [readOnly, updateIsDirty]);

  // Auto-delete/auto-save on unmount + debounce cleanup
  useEffect(
    () => () => {
      autosave.cancel();
      const currentDoc = editorRef.current?.view.state.doc;
      const isEditorEmpty =
        !currentDoc || ProsemirrorHelper.isEmpty(currentDoc);

      if (
        shouldAutoDeleteDraftOnUnmount({
          isEditorEmpty,
          title: titleRef.current,
          createdById: document.createdBy?.id,
          currentUserId: auth.user?.id,
          isDraft: document.isDraft,
          isActive: document.isActive,
          hasEmptyTitle: document.hasEmptyTitle,
          isPersistedOnce: document.isPersistedOnce,
        })
      ) {
        void document.delete();
      } else if (document.isDirty()) {
        void document.save(undefined, {
          autosave: true,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return {
    isUploading,
    isSaving,
    isPublishing,
    isEditorDirty,
    isEmpty,
    onSave,
    replaceSelection,
    handleSelectTemplate,
    handleChangeTitle,
    handleChangeIcon,
    onFileUploadStart,
    onFileUploadStop,
  };
}
