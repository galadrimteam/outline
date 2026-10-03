import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import { DocumentContextProvider } from "~/components/DocumentContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/primitives/Popover";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import type Document from "~/models/Document";
import { DiscussionList } from "~/scenes/Document/components/Comments/DiscussionList";
import { commentAnchors } from "./commentAnchors";

interface Props {
  databaseId: string;
  recordId: string;
  /** The comment count, which opens the popover. */
  children: React.ReactElement;
}

/**
 * Notion's popover of a row's comments, opened on the spot by its comment count: every open
 * discussion of the row's page, whole, the last one ready for a reply.
 *
 * @param props the row and the count that opens it.
 * @returns the count with its popover.
 */
export function RowCommentsPopover({ databaseId, recordId, children }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>{children}</PopoverTrigger>
      <Content
        aria-label={t("Comments")}
        width={POPOVER_WIDTH}
        side="bottom"
        align="start"
        collisionPadding={8}
        shrink
      >
        {/* The popover is drawn inside a table or a board, whose keys and clicks it keeps. */}
        <Isolated
          onKeyDown={stopPropagation}
          onPointerDown={stopPropagation}
          onMouseDown={stopPropagation}
          onTouchStart={stopPropagation}
          onClick={stopPropagation}
          onDoubleClick={stopPropagation}
        >
          {open && <RowComments databaseId={databaseId} recordId={recordId} />}
        </Isolated>
      </Content>
    </Popover>
  );
}

/** The discussions of a row's page, loaded with it. */
const RowComments = observer(function RowComments_({
  databaseId,
  recordId,
}: Omit<Props, "children">) {
  const { t } = useTranslation();
  const { comments, databaseRecords } = useStores();
  const [document, setDocument] = React.useState<Document>();

  React.useEffect(() => {
    let cancelled = false;
    databaseRecords
      .open(databaseId, recordId)
      .then(async (page) => {
        await comments.fetchAll({
          documentId: page.id,
          limit: 100,
          direction: "ASC",
        });
        if (!cancelled) {
          setDocument(page);
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error(t("Couldn’t open the page"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [comments, databaseId, databaseRecords, recordId, t]);

  if (!document) {
    return <Placeholder aria-busy />;
  }
  return (
    <DocumentContextProvider>
      <LoadedComments document={document} />
    </DocumentContextProvider>
  );
});

const LoadedComments = observer(function LoadedComments_({
  document,
}: {
  document: Document;
}) {
  const { comments } = useStores();
  const can = usePolicy(document);
  const anchors = commentAnchors(document.data);
  const anchoredIds = new Set(anchors.keys());
  const threads = [
    ...comments.pageThreadsInDocument(document.id, anchoredIds),
    ...comments
      .unresolvedThreadsInDocument(document.id)
      .filter((thread) => !thread.isNew && anchoredIds.has(thread.id)),
  ];
  // Captured once: a thread answered or resolved here must not move the reply form.
  const [lastId] = React.useState(threads[threads.length - 1]?.id);

  return (
    <DiscussionList
      document={document}
      threads={threads}
      fold={false}
      showForm={!threads.length && !!can.comment}
      formKey={0}
      anchors={anchors}
      initialFocusedId={lastId}
    />
  );
});

/** Notion's popover of a row's comments. */
const POPOVER_WIDTH = 480;

function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

const Content = styled(PopoverContent)`
  max-height: min(450px, var(--radix-popover-content-available-height));
`;

const Isolated = styled.div`
  padding: 8px 16px 0;
`;

const Placeholder = styled.div`
  height: 64px;
`;
