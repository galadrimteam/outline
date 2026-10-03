import { differenceInMilliseconds } from "date-fns";
import { runInAction } from "mobx";
import { observer } from "mobx-react";
import { DoneIcon } from "outline-icons";
import { darken, transparentize } from "polished";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled, { css } from "styled-components";
import breakpoint from "styled-components-breakpoint";
import EventBoundary from "@shared/components/EventBoundary";
import { s, hover } from "@shared/styles";
import type { ProsemirrorData } from "@shared/types";
import { dateToRelative, locales } from "@shared/utils/date";
import { Minute } from "@shared/utils/time";
import type Comment from "~/models/Comment";
import { Avatar } from "~/components/Avatar";
import ButtonSmall from "~/components/ButtonSmall";
import Flex from "~/components/Flex";
import NudeButton from "~/components/NudeButton";
import ReactionList from "~/components/Reactions/ReactionList";
import ReactionPicker from "~/components/Reactions/ReactionPicker";
import { ResizingHeightContainer } from "~/components/ResizingHeightContainer";
import Text from "~/components/Text";
import Time from "~/components/Time";
import Tooltip from "~/components/Tooltip";
import { resolveCommentActionFactory } from "~/actions/definitions/comments";
import useBoolean from "~/hooks/useBoolean";
import useCurrentUser from "~/hooks/useCurrentUser";
import CommentMenu from "~/menus/CommentMenu";
import lazyWithRetry from "~/utils/lazyWithRetry";

const CommentEditor = lazyWithRetry(() => import("./CommentEditor"));
import { HighlightedText } from "./HighlightText";
import { useDocumentContext } from "~/components/DocumentContext";

/**
 * Hook to calculate if we should display a timestamp on a comment
 *
 * @param createdAt The date the comment was created
 * @param previousCreatedAt The date of the previous comment, if any
 * @returns boolean if to show timestamp
 */
function useShowTime(
  createdAt: string | undefined,
  previousCreatedAt: string | undefined
): boolean {
  if (!createdAt) {
    return false;
  }

  const previousTimeStamp = previousCreatedAt
    ? dateToRelative(Date.parse(previousCreatedAt))
    : undefined;
  const currentTimeStamp = dateToRelative(Date.parse(createdAt));

  const msSincePreviousComment = previousCreatedAt
    ? differenceInMilliseconds(
        Date.parse(createdAt),
        Date.parse(previousCreatedAt)
      )
    : 0;

  return (
    !msSincePreviousComment ||
    (msSincePreviousComment > 15 * Minute.ms &&
      previousTimeStamp !== currentTimeStamp)
  );
}

type Props = {
  /** The comment to render */
  comment: Comment;
  /** Whether this is the first comment in the thread */
  firstOfThread?: boolean;
  /** Whether this is the last comment in the thread */
  lastOfThread?: boolean;
  /** Whether this is the first consecutive comment by this author */
  firstOfAuthor?: boolean;
  /** Whether this is the last consecutive comment by this author */
  lastOfAuthor?: boolean;
  /** The date of the previous comment in the thread */
  previousCommentCreatedAt?: string;
  /** Whether the user can reply in the thread */
  canReply: boolean;
  /** Callback when the comment has been deleted */
  onDelete?: (id: string) => void;
  /** Callback when the comment has been updated */
  onUpdate?: (id: string, attrs: { resolved: boolean }) => void;
  /** Text to highlight at the top of the comment */
  highlightedText?: string;
  /** Whether to force the comment into edit mode */
  forceEdit?: boolean;
  /** Callback when edit mode starts */
  onEditStart?: () => void;
  /** Callback when edit mode ends */
  onEditEnd?: () => void;
  /**
   * galadrim: drawn in the page as Notion's page discussions: a plain row with its author and the
   * day it was written, a line down to the next comment of the thread, no bubble.
   */
  inPage?: boolean;
};

function CommentThreadItem({
  comment,
  firstOfAuthor,
  firstOfThread,
  lastOfThread,
  previousCommentCreatedAt,
  canReply,
  onDelete,
  onUpdate,
  highlightedText,
  forceEdit,
  onEditStart,
  onEditEnd,
  inPage,
}: Props) {
  const { setFocusedCommentId } = useDocumentContext();
  const { t } = useTranslation();
  const user = useCurrentUser();
  const [data, setData] = React.useState(comment.data);
  const showAuthor = inPage || firstOfAuthor;
  const showTime =
    useShowTime(comment.createdAt, previousCommentCreatedAt) || !!inPage;
  const showEdited =
    comment.updatedAt &&
    comment.updatedAt !== comment.createdAt &&
    !comment.isResolved;
  const [isEditing, setEditing, setReadOnly] = useBoolean();

  // Handle forced edit mode
  React.useEffect(() => {
    if (forceEdit && !isEditing) {
      setEditing();
      onEditStart?.();
    }
  }, [forceEdit, isEditing, setEditing, onEditStart]);

  // Override setReadOnly to call onEditEnd
  const handleSetReadOnly = React.useCallback(() => {
    setReadOnly();
    onEditEnd?.();
  }, [setReadOnly, onEditEnd]);
  const formRef = React.useRef<HTMLFormElement>(null);

  const handleAddReaction = React.useCallback(
    async (emoji: string) => {
      await comment.addReaction({ emoji, user });
    },
    [comment, user]
  );

  const handleRemoveReaction = React.useCallback(
    async (emoji: string) => {
      await comment.removeReaction({ emoji, user });
    },
    [comment, user]
  );

  const handleUpdate = React.useCallback(
    (attrs: { resolved: boolean }) => {
      onUpdate?.(comment.id, attrs);
      if ("resolved" in attrs) {
        setFocusedCommentId(null);
      }
    },
    [comment.id, onUpdate, setFocusedCommentId]
  );

  const handleDelete = React.useCallback(() => {
    onDelete?.(comment.id);
  }, [comment.id, onDelete]);

  const handleChange = React.useCallback(
    (value: (asString: boolean) => ProsemirrorData) => {
      setData(value(false));
    },
    []
  );

  const handleSave = React.useCallback(() => {
    formRef.current?.dispatchEvent(
      new Event("submit", { cancelable: true, bubbles: true })
    );
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      handleSetReadOnly();
      runInAction(() => (comment.data = data));
      await comment.save();
    } catch (_err) {
      setEditing();
      toast.error(t("Error updating comment"));
    }
  };

  const handleCancel = () => {
    setData(comment.data);
    handleSetReadOnly();
  };

  return (
    <Row
      gap={inPage ? 10 : 8}
      align="flex-start"
      $inPage={inPage}
      $threadLine={inPage && !lastOfThread}
    >
      {showAuthor && (
        <AvatarSpacer $inPage={inPage}>
          <Avatar model={comment.createdBy} size={24} />
        </AvatarSpacer>
      )}
      <Bubble
        $firstOfThread={firstOfThread}
        $firstOfAuthor={showAuthor}
        $lastOfThread={lastOfThread}
        $canReply={canReply}
        $inPage={inPage}
        column
      >
        {inPage ? (
          <PageMeta>
            <strong>{comment.createdBy.name}</strong>
            <Time
              dateTime={comment.createdAt}
              relative={false}
              format={dayFormats}
            />
            {showEdited && (
              <Time dateTime={comment.updatedAt}>({t("edited")})</Time>
            )}
          </PageMeta>
        ) : (
          (showAuthor || showTime) && (
            <Meta size="xsmall" type="secondary">
              {showAuthor && <em>{comment.createdBy.name}</em>}
              {showAuthor && showTime && <> &middot; </>}
              {showTime && (
                <Time dateTime={comment.createdAt} addSuffix shorten />
              )}
              {showEdited && (
                <>
                  {" "}
                  (<Time dateTime={comment.updatedAt}>{t("edited")}</Time>)
                </>
              )}
            </Meta>
          )
        )}
        {highlightedText && (
          <HighlightedText>{highlightedText}</HighlightedText>
        )}
        <Body ref={formRef} onSubmit={handleSubmit}>
          <React.Suspense fallback={null}>
            <StyledCommentEditor
              key={String(isEditing)}
              readOnly={!isEditing}
              value={comment.data}
              defaultValue={data}
              onChange={handleChange}
              onSave={handleSave}
              onCancel={handleCancel}
              autoFocus
            />
          </React.Suspense>
          {isEditing && (
            <Flex align="flex-end" gap={8}>
              <ButtonSmall type="submit" borderOnHover>
                {t("Save")}
              </ButtonSmall>
              <ButtonSmall onClick={handleCancel} neutral borderOnHover>
                {t("Cancel")}
              </ButtonSmall>
            </Flex>
          )}
          <ResizingHeightContainer hideOverflow>
            {!!comment.reactions.length && (
              <ReactionListContainer gap={6} align="center">
                <ReactionList
                  model={comment}
                  onAddReaction={handleAddReaction}
                  onRemoveReaction={handleRemoveReaction}
                  picker={
                    !comment.isResolved ? (
                      <Action
                        as={ReactionPicker}
                        onSelect={handleAddReaction}
                        size={28}
                        $rounded
                      />
                    ) : undefined
                  }
                />
              </ReactionListContainer>
            )}
          </ResizingHeightContainer>
        </Body>
        <EventBoundary>
          {!isEditing && (
            <Actions gap={4}>
              {!comment.isResolved && (
                <>
                  {firstOfThread && (
                    <ResolveButton onUpdate={handleUpdate} comment={comment} />
                  )}
                  <Action
                    as={ReactionPicker}
                    onSelect={handleAddReaction}
                    $rounded
                  />
                </>
              )}
              <Action
                as={CommentMenu}
                comment={comment}
                onEdit={() => {
                  setEditing();
                  onEditStart?.();
                }}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
              />
            </Actions>
          )}
        </EventBoundary>
      </Bubble>
    </Row>
  );
}

/** Notion dates a page discussion by its day, « 13/11/2025 »: date-fns' localized short date. */
const dayFormats = Object.fromEntries(
  Object.keys(locales).map((locale) => [locale, "P"])
);

const ResolveButton = ({
  comment,
  onUpdate,
}: {
  comment: Comment;
  onUpdate: (attrs: { resolved: boolean }) => void;
}) => {
  const { t } = useTranslation();

  return (
    <Tooltip content={t("Mark as resolved")} placement="top">
      <Action
        as={NudeButton}
        action={resolveCommentActionFactory({
          comment,
          onResolve: () => onUpdate({ resolved: true }),
        })}
        $rounded
      >
        <DoneIcon size={22} outline />
      </Action>
    </Tooltip>
  );
};

const StyledCommentEditor = styled(CommentEditor)`
  ${(props) =>
    !props.readOnly &&
    css`
      box-shadow: 0 0 0 2px ${props.theme.accent};
      border-radius: 2px;
      padding: 2px;
      margin: 2px;
      margin-bottom: 8px;
    `}

  .mention {
    background: ${(props) => darken(0.05, props.theme.mentionBackground)};
  }
`;

const AvatarSpacer = styled(Flex)<{ $inPage?: boolean }>`
  width: 24px;
  height: 24px;
  margin-top: ${(props) => (props.$inPage ? 0 : 4)}px;
  align-items: flex-end;
  justify-content: flex-end;
  flex-shrink: 0;
  flex-direction: column;
`;

const Body = styled.form`
  border-radius: 2px;
`;

const Action = styled.span<{ $rounded?: boolean }>`
  color: ${s("textSecondary")};
  ${(props) =>
    props.$rounded &&
    css`
      border-radius: 50%;
    `}

  svg {
    fill: currentColor;
    opacity: 0.5;
  }

  &[aria-expanded="true"],
  &:${hover} {
    background: ${s("backgroundQuaternary")};

    svg {
      opacity: 0.75;
    }
  }
`;

const Actions = styled(Flex)`
  position: absolute;
  inset-inline-end: 4px;
  top: 4px;
  transition: opacity 100ms ease-in-out;
  background: ${s("backgroundSecondary")};
  padding-inline-start: 4px;

  ${breakpoint("tablet")`
    opacity: 0;
  `}

  &:has(${Action}[aria-expanded="true"]) {
    opacity: 1;
  }
`;

const ReactionListContainer = styled(Flex)`
  padding-top: 6px;
`;

/** Notion's author line: the name in the text colour, the day smaller and greyer. */
const PageMeta = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-height: 24px;
  line-height: 24px;
  margin-bottom: 1px;
  font-size: 12px;
  color: ${(props) => transparentize(0.5, props.theme.text)};

  strong {
    font-size: 14px;
    font-weight: 500;
    color: ${s("text")};
  }
`;

const Meta = styled(Text)`
  margin-bottom: 2px;

  em {
    font-weight: 600;
    font-style: normal;
  }
`;

/** A comment with its avatar; in the page, Notion's line down the thread under the avatar. */
const Row = styled(Flex)<{ $inPage?: boolean; $threadLine?: boolean }>`
  position: relative;
  padding-bottom: ${(props) => (props.$inPage ? 16 : 0)}px;

  ${(props) =>
    props.$threadLine &&
    css`
      &::before {
        content: "";
        position: absolute;
        inset-inline-start: 11.5px;
        top: 30px;
        bottom: 4px;
        width: 1px;
        background: ${transparentize(0.88, props.theme.text)};
      }
    `}
`;

export const Bubble = styled(Flex)<{
  $firstOfThread?: boolean;
  $firstOfAuthor?: boolean;
  $lastOfThread?: boolean;
  $canReply?: boolean;
  $focused?: boolean;
  /** Plain text in the page, as Notion's page discussions: no bubble, 14px. */
  $inPage?: boolean;
}>`
  position: relative;
  flex-grow: 1;
  font-size: 16px;
  color: ${s("text")};
  background: ${s("backgroundSecondary")};
  min-width: 2em;
  margin-bottom: 1px;
  padding: 8px 12px;
  transition:
    color 100ms ease-out,
    background 100ms ease-out;

  ${({ $lastOfThread, $canReply }) =>
    $lastOfThread &&
    !$canReply &&
    "border-end-start-radius: 8px; border-end-end-radius: 8px"};

  ${({ $firstOfThread }) =>
    $firstOfThread &&
    "border-start-start-radius: 8px; border-start-end-radius: 8px"};

  margin-inline-start: ${(props) => (props.$firstOfAuthor ? 0 : 32)}px;

  p:last-child {
    margin-bottom: 0;
  }

  &: ${hover} ${Actions} {
    opacity: 1;
  }

  ${breakpoint("tablet")`
    font-size: 15px;
  `}

  ${(props) =>
    props.$inPage &&
    css`
      &&& {
        background: none;
        padding: 0;
        margin-bottom: 0;
        border-radius: 0;
        font-size: 14px;
      }

      ${Actions} {
        top: 0;
        background: ${props.theme.background};
      }
    `}
`;

export default observer(CommentThreadItem);
