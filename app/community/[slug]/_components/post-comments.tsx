'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Flag, Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/frontend/shared/cn';
import {
  createPostComment,
  deletePostComment,
  fetchPostComments,
  updatePostComment,
} from '@/frontend/api/community-engagement';
import { useSession } from '@/frontend/state/session-provider';
import { useCommentCountSetter } from '@/frontend/state/community/post-engagement-provider';
import { reportComment } from '@/frontend/api/comment-reports';
import type { CommentReportReason } from '@/shared/contracts/comment-reports';
import { ChatBody } from '@/frontend/ui/chats/chat-body';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { LoadingThread } from '@/frontend/ui/shared/loading-skeletons';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { useSignInPrompt } from '@/frontend/ui/shared/use-sign-in-prompt';
import { PostCommentField } from './post-comment-field';
import { PostCommentOwnerActions } from './post-comment-owner-actions';
import { PostTime } from '@/app/community/_components/post-time';
import { type PostComment } from '@/shared/contracts/community';
import { COMMUNITY_POST_COPY } from '../community-post-copy';

interface PostCommentsProps {
  postId: string;
  slug: string;
  /** The post's author may remove a reply without being its writer (ADR-0217). */
  postAuthorId: string | null;
}

/**
 * A post's thread (#1573).
 *
 * The post document is cached and shared, so the thread is read on the client
 * after paint: a comment written a second ago must not wait five minutes for the
 * page's revalidation, and a guest must be able to read it without a session.
 *
 * Reads page oldest-last (newest first); a write prepends its own row and settles
 * the action bar's number from the server's count, so the two never disagree.
 */
export function PostComments({ postId, slug, postAuthorId }: PostCommentsProps) {
  const { user } = useSession();
  const pathname = usePathname();
  const setCommentCount = useCommentCountSetter();
  const { requireSignIn, dialog } = useSignInPrompt(COMMUNITY_POST_COPY.commentSignIn);

  const [comments, setComments] = useState<PostComment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);

  const publishTotal = useCallback(
    (count: number) => {
      setTotal(count);
      setCommentCount(postId, count);
    },
    [postId, setCommentCount]
  );

  useEffect(() => {
    let cancelled = false;

    fetchPostComments(slug)
      .then((page) => {
        if (cancelled) return;
        setComments(page.comments);
        setNextCursor(page.nextCursor ?? null);
        publishTotal(page.total);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('failed');
      });

    return () => {
      cancelled = true;
    };
  }, [slug, publishTotal]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPostComments(slug, nextCursor);
      setComments((current) => [...current, ...page.comments]);
      setNextCursor(page.nextCursor ?? null);
      publishTotal(page.total);
    } catch {
      toast.error(COMMUNITY_POST_COPY.commentFailed);
    } finally {
      setLoadingMore(false);
    }
  };

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending) return;

    if (!user) {
      requireSignIn(pathname || `/community/${slug}`);
      return;
    }

    setSending(true);
    try {
      const result = await createPostComment(slug, body);
      setComments((current) => [result.comment, ...current]);
      setDraft('');
      publishTotal(result.commentCount);
      toast.success(COMMUNITY_POST_COPY.commentPublished);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : COMMUNITY_POST_COPY.commentFailed);
    } finally {
      setSending(false);
    }
  };

  const startEdit = (comment: PostComment) => {
    setEditingId(comment.id);
    setEditDraft(comment.body);
  };

  const saveEdit = async (comment: PostComment) => {
    const body = editDraft.trim();
    if (!body || savingEdit) return;

    setSavingEdit(true);
    try {
      const result = await updatePostComment(comment.id, body);
      setComments((current) =>
        current.map((row) => (row.id === comment.id ? result.comment : row))
      );
      setEditingId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : COMMUNITY_POST_COPY.commentFailed);
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async (target: PostComment) => {
    // The row leaves the thread only when the server says it did: an optimistic
    // removal that fails would put a comment back under a reader mid-sentence.
    try {
      const result = await deletePostComment(target.id);
      setComments((current) => current.filter((row) => row.id !== target.id));
      publishTotal(result.commentCount);
      toast.success(COMMUNITY_POST_COPY.commentDeleted);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : COMMUNITY_POST_COPY.commentFailed);
    }
  };

  const report = async (comment: PostComment, reason: CommentReportReason) => {
    setReportingId(comment.id);
    try {
      await reportComment(comment.id, reason);
      toast.success(COMMUNITY_POST_COPY.commentReported);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : COMMUNITY_POST_COPY.commentFailed);
    } finally {
      setReportingId(null);
    }
  };

  return (
    <>
      <section
        id="comments"
        aria-labelledby="comments-title"
        data-visual="community-post-comments"
        className="mt-6 scroll-mt-24 border-t border-border/60 pt-8"
      >
        <div className="mb-5 flex items-center gap-2.5">
          <MessageCircle className="size-5 text-primary/80" aria-hidden="true" />
          <h2 id="comments-title" className="text-lg font-bold tracking-tight text-foreground">
            {COMMUNITY_POST_COPY.commentsTitle}
          </h2>
          {total !== null && total > 0 && (
            <span className="font-digits text-sm font-bold text-muted-foreground" dir="ltr">
              {total.toLocaleString('en-US')}
            </span>
          )}
        </div>

        {status === 'loading' && (
          <LoadingThread label={COMMUNITY_POST_COPY.commentsTitle} framed={false} />
        )}

        {status === 'failed' && (
          <p className="text-sm text-muted-foreground">{COMMUNITY_POST_COPY.commentFailed}</p>
        )}

        {status === 'ready' && comments.length === 0 && (
          <EmptyState
            icon={MessageCircle}
            title={COMMUNITY_POST_COPY.commentsEmpty}
            description={COMMUNITY_POST_COPY.commentsEmptyHint}
          />
        )}

        {comments.length > 0 && (
          <ul className="flex flex-col gap-5">
            {comments.map((comment) => {
              const mine = user?.id === comment.author?.id;
              const isHost = !mine && !!user && postAuthorId === user.id;
              const editing = editingId === comment.id;

              return (
                <li
                  key={comment.id}
                  className="group/comment flex gap-3"
                  data-visual="community-comment"
                >
                  <MemberAvatar
                    name={comment.author?.name ?? comment.author?.username ?? null}
                    avatarUrl={comment.author?.avatar_url ?? null}
                    size="xs"
                    ring={false}
                    className="mt-0.5"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      {comment.author ? (
                        <Link
                          href={`/u/${encodeURIComponent(comment.author.username)}`}
                          className="font-bold text-foreground hover:text-primary"
                        >
                          {comment.author.name?.trim() || `@${comment.author.username}`}
                        </Link>
                      ) : (
                        <span className="font-bold text-muted-foreground">—</span>
                      )}
                      <PostTime iso={comment.createdAt} className="text-muted-foreground" />
                      {comment.editedAt && (
                        <span className="text-[11px] text-muted-foreground/70">
                          {COMMUNITY_POST_COPY.commentEdited}
                        </span>
                      )}

                      {(mine || isHost) && !editing && (
                        <PostCommentOwnerActions
                          onEdit={mine ? () => startEdit(comment) : undefined}
                          onDelete={() => void confirmDelete(comment)}
                          isHost={isHost}
                        />
                      )}

                      {user && !mine && (
                        <label className="ms-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Flag className="size-3.5" aria-hidden="true" />
                          <select
                            aria-label={COMMUNITY_POST_COPY.commentReport}
                            value=""
                            disabled={reportingId === comment.id}
                            onChange={(event) =>
                              void report(comment, event.target.value as CommentReportReason)
                            }
                            className="rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[11px]"
                          >
                            <option value="">{COMMUNITY_POST_COPY.commentReport}</option>
                            <option value="spam">{COMMUNITY_POST_COPY.commentReportSpam}</option>
                            <option value="abuse">{COMMUNITY_POST_COPY.commentReportAbuse}</option>
                            <option value="other">{COMMUNITY_POST_COPY.commentReportOther}</option>
                          </select>
                        </label>
                      )}
                    </div>

                    {editing ? (
                      <div className="mt-2 space-y-2">
                        <PostCommentField
                          value={editDraft}
                          onChange={setEditDraft}
                          onSend={() => void saveEdit(comment)}
                          disabled={savingEdit}
                          sending={savingEdit}
                          sendLabel={COMMUNITY_POST_COPY.commentEdit}
                        />
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-bold text-muted-foreground hover:bg-muted/60"
                        >
                          {COMMUNITY_POST_COPY.commentCancel}
                        </button>
                      </div>
                    ) : (
                      <p
                        className={cn(
                          'mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90'
                        )}
                      >
                        <ChatBody text={comment.body} />
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {nextCursor && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-4 text-xs font-bold text-muted-foreground transition-safe hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
            >
              {loadingMore && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {COMMUNITY_POST_COPY.commentsLoadMore}
            </button>
          </div>
        )}
      </section>

      <div
        data-visual="community-comment-dock"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto max-w-2xl">
          <PostCommentField
            value={draft}
            onChange={setDraft}
            onSend={() => void submit()}
            disabled={sending}
            sending={sending}
          />
        </div>
        {dialog}
      </div>
    </>
  );
}
