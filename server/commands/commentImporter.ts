import httpErrors from "http-errors";
import type { Transaction } from "sequelize";
import type { ProsemirrorData } from "@shared/types";
import { ValidationError } from "@server/errors";
import type { Document } from "@server/models";
import { Comment, User } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { ProsemirrorHelper } from "@server/models/helpers/ProsemirrorHelper";
import type { APIContext } from "@server/types";

/** The text of the document a thread is anchored to. */
export interface CommentAnchor {
  /** Plain text to anchor to, the first matching occurrence is used. */
  text: string;
  /** Plain text immediately preceding `text`, to pick an occurrence. */
  prefix?: string | null;
  /** Plain text immediately following `text`, to pick an occurrence. */
  suffix?: string | null;
}

/** A comment written elsewhere, carried over with its author and dates. */
export interface CommentImportProps {
  /** The comment's id, which makes a replay find the comment. */
  id: string;
  /** The document, loaded with its state and locked when anchoring. */
  document: Document;
  /** The thread the comment replies to. */
  parentCommentId?: string | null;
  /** The author, a user of the acting user's team. */
  createdById: string;
  /** When the author wrote the comment. */
  createdAt: Date;
  /** The comment's content. */
  data: ProsemirrorData;
  /** When the thread was resolved, ignored on a reply. */
  resolvedAt?: Date | null;
  /** Who resolved the thread, the author when omitted. */
  resolvedById?: string | null;
  /** Where to anchor the thread, ignored on a reply. */
  anchor?: CommentAnchor | null;
}

/** The outcome of a comment import. */
export interface CommentImportResult {
  /** The imported comment, or the one found with its id. */
  comment: Comment;
  /** False when a comment with this id already existed and was left as is. */
  created: boolean;
  /** Whether the document carries a mark for the comment. */
  anchored: boolean;
  /** Whether a replay handed a comment kept under the importing account to its author. */
  reattributed: boolean;
}

/**
 * Imports a comment written elsewhere with its author, date and resolved
 * state. A comment that already exists with the same id is returned untouched,
 * so an import can be replayed, unless it is still under the importing account
 * and the replay names another author: an author who had no account at the
 * first import is then handed the comment, with the content of the replay
 * (see `reattribute`). The comment is published with the `import` source,
 * which notifies nobody, and anchoring does not mark the document as updated.
 * When the anchor text is not in the document, the comment is kept as a
 * document comment. The caller authorizes the acting user on the document.
 *
 * @param ctx the request context, whose user is the importing admin.
 * @param props the comment to import.
 * @returns the comment, whether it was created or reattributed and whether it
 *   is anchored.
 * @throws ValidationError when the id belongs to a comment of another document,
 *   or the author or the resolver is not a user of the team.
 */
export async function commentImporter(
  ctx: APIContext,
  props: CommentImportProps
): Promise<CommentImportResult> {
  const { transaction } = ctx.state;
  const { user } = ctx.state.auth;
  const { id, document } = props;

  const existing = await Comment.findByPk(id, { transaction, paranoid: false });
  if (existing) {
    if (existing.documentId !== document.id) {
      throw ValidationError(
        "A comment with this id belongs to another document"
      );
    }
    const reattributed = await reattribute(ctx, existing, props);
    return {
      comment: reattributed
        ? await Comment.findByPk(id, { transaction, rejectOnEmpty: true })
        : existing,
      created: false,
      anchored: hasCommentMark(document, id),
      reattributed,
    };
  }

  const isReply = !!props.parentCommentId;
  const author = await findTeamUser(
    user.teamId,
    props.createdById,
    "createdById",
    transaction
  );
  const resolvedAt = isReply ? null : (props.resolvedAt ?? null);
  const resolver = resolvedAt
    ? await findTeamUser(
        user.teamId,
        props.resolvedById ?? author.id,
        "resolvedById",
        transaction
      )
    : null;

  const anchored =
    !isReply && props.anchor
      ? await anchorComment(ctx, document, id, author.id, props.anchor)
      : false;

  await Comment.createWithCtx(
    ctx,
    {
      id,
      data: props.data,
      documentId: document.id,
      parentCommentId: props.parentCommentId ?? undefined,
      createdById: author.id,
      createdAt: props.createdAt,
      updatedAt: props.createdAt,
      resolvedAt,
      resolvedById: resolver?.id ?? null,
    },
    { data: { source: "import" } },
    { silent: true }
  );

  // loaded again for the users, a reply having inherited its thread's resolver
  const comment = await Comment.findByPk(id, {
    transaction,
    rejectOnEmpty: true,
  });

  return { comment, created: true, anchored, reattributed: false };
}

/**
 * An author without an account is imported under the importing account, the
 * caller writing their name into the comment. Once they have an account, a
 * replay that names them hands them the comment and its content, now without
 * the name, and the thread they resolved. Only the importing account's own
 * comments are moved, and only to another user of the team.
 */
async function reattribute(
  ctx: APIContext,
  existing: Comment,
  props: CommentImportProps
) {
  const { transaction } = ctx.state;
  const { user } = ctx.state.auth;
  if (existing.createdById !== user.id || props.createdById === user.id) {
    return false;
  }

  const author = await findTeamUser(
    user.teamId,
    props.createdById,
    "createdById",
    transaction
  );
  const resolvedByImporter =
    !existing.parentCommentId &&
    !!existing.resolvedAt &&
    existing.resolvedById === user.id;
  const resolver = resolvedByImporter
    ? await findTeamUser(
        user.teamId,
        props.resolvedById ?? author.id,
        "resolvedById",
        transaction
      )
    : null;

  await existing.update(
    {
      createdById: author.id,
      data: props.data,
      ...(resolver ? { resolvedById: resolver.id } : {}),
    },
    { transaction, silent: true }
  );
  if (resolver) {
    await Comment.update(
      { resolvedById: resolver.id },
      {
        where: { parentCommentId: existing.id, resolvedById: user.id },
        transaction,
        hooks: false,
      }
    );
  }
  return true;
}

async function findTeamUser(
  teamId: string,
  userId: string,
  field: string,
  transaction?: Transaction
) {
  const found = await User.findOne({
    where: { id: userId, teamId },
    transaction,
  });
  if (!found) {
    throw ValidationError(`${field} must be a user of the team`);
  }
  return found;
}

function hasCommentMark(document: Document, commentId: string) {
  return ProsemirrorHelper.getComments(
    DocumentHelper.toProsemirror(document)
  ).some((mark) => mark.id === commentId);
}

async function anchorComment(
  ctx: APIContext,
  document: Document,
  commentId: string,
  userId: string,
  anchor: CommentAnchor
) {
  const updated = applyCommentMark(document, commentId, userId, anchor);
  if (!updated) {
    return false;
  }

  await document.update(
    { state: updated.state, content: updated.content },
    { ...ctx.context, transaction: ctx.state.transaction, silent: true }
  );
  return true;
}

function applyCommentMark(
  document: Document,
  commentId: string,
  userId: string,
  anchor: CommentAnchor
) {
  try {
    return ProsemirrorHelper.applyCommentMarkByText({
      docState: DocumentHelper.toState(document),
      anchorText: anchor.text,
      commentId,
      userId,
      prefix: anchor.prefix ?? undefined,
      suffix: anchor.suffix ?? undefined,
    });
  } catch (err) {
    // the text was edited away since the comment was written
    if (httpErrors.isHttpError(err) && err.status === 400) {
      return null;
    }
    throw err;
  }
}
