'use client';

import { useState } from 'react';
import { PenLine, Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { COMMUNITY_POST_COPY } from '../community-post-copy';

interface PostCommentOwnerActionsProps {
  /** The writer may edit; the post's host may only remove. */
  onEdit?: () => void;
  onDelete: () => void;
  isHost?: boolean;
}

/**
 * A member's own comment, in their own hands (#1573).
 *
 * Kept out of the row that draws the thread because the port to the app reads
 * the row's controls: edit and delete are the client's own affordances, and a
 * glyph the site draws is a glyph the app has to draw too. The thread itself is
 * the shared design; these two buttons are the web's.
 */
export function PostCommentOwnerActions({
  onEdit,
  onDelete,
  isHost = false,
}: PostCommentOwnerActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <span className="ms-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/comment:opacity-100 max-sm:opacity-100">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={COMMUNITY_POST_COPY.commentEdit}
            title={COMMUNITY_POST_COPY.commentEdit}
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <PenLine className="size-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          aria-label={
            isHost ? COMMUNITY_POST_COPY.commentRemove : COMMUNITY_POST_COPY.commentDelete
          }
          title={isHost ? COMMUNITY_POST_COPY.commentRemove : COMMUNITY_POST_COPY.commentDelete}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </span>

      <ConfirmDialog
        open={confirmOpen}
        title={
          isHost ? COMMUNITY_POST_COPY.commentRemoveTitle : COMMUNITY_POST_COPY.commentDeleteTitle
        }
        message={
          isHost ? COMMUNITY_POST_COPY.commentRemoveBody : COMMUNITY_POST_COPY.commentDeleteBody
        }
        confirmLabel={
          isHost ? COMMUNITY_POST_COPY.commentRemove : COMMUNITY_POST_COPY.commentDelete
        }
        cancelLabel={COMMUNITY_POST_COPY.commentCancel}
        icon={Trash2}
        variant="danger"
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
