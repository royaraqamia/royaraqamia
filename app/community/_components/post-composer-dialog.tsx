'use client';

import { useEffect, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { Label } from '@/frontend/ui/primitives/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { tolerateChunkFailure } from '@/frontend/ui/shared/lazy-chunk';
import { createPost, updatePost } from '@/frontend/api/blogpress';
import { showActionError } from '@/frontend/ui/plans/show-plan-error';
import { stripMarkdown } from '@/shared/reading-time';
import { COMMUNITY_EDITOR_COPY } from './community-editor-copy';
import { COMMUNITY_COMPOSER_COPY } from './community-composer-copy';

const BODY_MAX = 20000;
const DESCRIPTION_PREVIEW = 160;

/** The edit dialog's four save faces, the same ones the app draws (#925). */
type SaveState = 'atRest' | 'draft' | 'saving' | 'failed';

/** The composer's publish faces, the same ones the app draws (#924). */
type PublishState = 'atRest' | 'publishing' | 'published' | 'failed';

function statusLabel(state: SaveState): string {
  switch (state) {
    case 'draft':
      return COMMUNITY_EDITOR_COPY.unsaved;
    case 'saving':
      return COMMUNITY_EDITOR_COPY.saving;
    case 'failed':
      return COMMUNITY_EDITOR_COPY.saveFailed;
    default:
      return COMMUNITY_EDITOR_COPY.saved;
  }
}

function publishLabel(state: PublishState): string {
  switch (state) {
    case 'publishing':
      return COMMUNITY_COMPOSER_COPY.publishing;
    case 'published':
      return COMMUNITY_COMPOSER_COPY.published;
    case 'failed':
      return COMMUNITY_COMPOSER_COPY.publishFailed;
    default:
      return COMMUNITY_COMPOSER_COPY.publish;
  }
}

/**
 * The editor is Tiptap, `marked` and `turndown` — a third of `/community`'s
 * budget, and a reader who only scrolls the feed never needs it. It arrives as
 * its own chunk when a composer opens, and a chunk that cannot be fetched
 * renders the frame rather than taking the page down with it.
 */
const NoteBodyEditor = dynamic(
  tolerateChunkFailure('post editor', () =>
    import('@/frontend/ui/notes/note-body-editor').then((module) => ({
      default: module.NoteBodyEditor,
    }))
  ),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-40 animate-pulse rounded-xl bg-muted/20" aria-hidden="true" />
    ),
  }
);

export interface PostComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (slug: string) => void;
  mode?: 'create' | 'edit';
  postId?: string;
  slug?: string;
  initialBody?: string;
  coverImage?: string;
  metaTitle?: string;
}

/**
 * Every community post gets the same URL-safe identifier shape — `post-xxxxxxxx`
 * — so the (title-less) post's slug never depends on its content language.
 */
function buildSlug(): string {
  return `post-${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)).slice(0, 8)}`;
}

/**
 * Facebook-style composer for the public community. Renders the same form for a
 * brand-new post (`create`) and for editing an existing one (`edit`), so the FAB
 * and the per-post action menu share a single surface.
 *
 * The edit face owns the site's four save states, which the app draws from the
 * same copy source (#925): at rest, a change the server has not accepted, saving
 * and a refusal. A create is a single publish, so it has no draft state to show.
 */
export function PostComposerDialog({
  open,
  onOpenChange,
  onSaved,
  mode = 'create',
  postId,
  slug,
  initialBody = '',
  coverImage = '',
  metaTitle = '',
}: PostComposerDialogProps) {
  const isEdit = mode === 'edit';
  const [body, setBody] = useState(initialBody);
  const [saveState, setSaveState] = useState<SaveState>('atRest');
  const [publishState, setPublishState] = useState<PublishState>('atRest');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setBody(initialBody);
    setSaveState('atRest');
    setPublishState('atRest');
  }, [open, initialBody]);

  const charCount = body.length;

  const handleBody = (value: string) => {
    setBody(value);
    if (isEdit) {
      setSaveState(value === initialBody ? 'atRest' : 'draft');
    } else if (publishState === 'failed') {
      // A change after a refusal is an attempt to try again: the sentence about
      // the last failure belongs to the text that produced it.
      setPublishState('atRest');
    }
  };

  const handleSubmit = () => {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      toast.error(COMMUNITY_EDITOR_COPY.emptyBody);
      return;
    }
    if (charCount > BODY_MAX) {
      toast.error(COMMUNITY_EDITOR_COPY.tooLong.replace('{max}', String(BODY_MAX)));
      return;
    }

    // What a reader sees in the feed and in a shared preview: the Markdown
    // syntax the editor writes is not part of it.
    const description = stripMarkdown(trimmedBody).slice(0, DESCRIPTION_PREVIEW);

    if (isEdit) setSaveState('saving');
    else setPublishState('publishing');

    startTransition(async () => {
      try {
        if (isEdit) {
          if (!postId || !slug) return;
          const result = await updatePost(postId, {
            slug,
            content: trimmedBody,
            cover_image: coverImage,
            meta_title: metaTitle,
            meta_desc: description,
          });
          if (result?.message === 'تمَّ حفظ المنشور') {
            setSaveState('atRest');
            toast.success(COMMUNITY_EDITOR_COPY.saveSuccess);
            onOpenChange(false);
            onSaved(slug);
          } else if (result?.errors) {
            setSaveState('failed');
            toast.error(COMMUNITY_EDITOR_COPY.invalidFields);
          } else {
            setSaveState('failed');
            toast.error(COMMUNITY_EDITOR_COPY.saveFailed);
          }
          return;
        }

        const newSlug = buildSlug();
        await createPost({
          slug: newSlug,
          content: trimmedBody,
          cover_image: '',
          meta_title: '',
          meta_desc: description,
          status: 'published',
        });
        setPublishState('published');
        toast.success(COMMUNITY_COMPOSER_COPY.published);
        onOpenChange(false);
        onSaved(newSlug);
      } catch (error) {
        if (isEdit) {
          setSaveState('failed');
          showActionError(error, COMMUNITY_EDITOR_COPY.saveFailed);
        } else {
          setPublishState('failed');
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            toast.error(COMMUNITY_COMPOSER_COPY.needsConnection);
          } else {
            showActionError(error, COMMUNITY_COMPOSER_COPY.publishFailed);
          }
        }
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent phone="sheet">
        <DialogHeader>
          <DialogTitle className="text-center">
            {isEdit ? COMMUNITY_EDITOR_COPY.title : COMMUNITY_COMPOSER_COPY.title}
          </DialogTitle>
        </DialogHeader>

        <div className="min-w-0 space-y-4 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col">
          <div className="space-y-1.5 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col">
            <Label htmlFor="composer-body" required>
              {COMMUNITY_EDITOR_COPY.bodyLabel}
            </Label>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-input/80 bg-background/80">
              <NoteBodyEditor
                initialMarkdown={initialBody}
                onChange={handleBody}
                id="composer-body"
                ariaLabel={COMMUNITY_EDITOR_COPY.bodyAria}
                placeholder={COMMUNITY_EDITOR_COPY.bodyPlaceholder}
                surfaceClassName="min-h-40 max-sm:min-h-0"
              />
            </div>
            {/* `dir="ltr"`: two numbers around a slash, and RTL puts the logical
                first run rightmost — the counter painted `20,000 / 15`. */}
            <p
              data-slot="composer-meta"
              aria-live="polite"
              dir="ltr"
              className={
                charCount > BODY_MAX
                  ? 'text-end text-[11px] font-bold text-destructive'
                  : 'text-end text-[11px] text-muted-foreground'
              }
            >
              {COMMUNITY_EDITOR_COPY.counter
                .replace('{count}', String(charCount))
                .replace('{max}', BODY_MAX.toLocaleString('en-US'))}
            </p>
          </div>
        </div>

        {isEdit ? (
          <p
            data-slot="composer-status"
            aria-live="polite"
            className={
              saveState === 'failed'
                ? 'text-end text-[11px] font-bold text-destructive'
                : 'text-end text-[11px] text-muted-foreground'
            }
          >
            {statusLabel(saveState)}
          </p>
        ) : (
          publishState !== 'atRest' && (
            <p
              data-slot="composer-status"
              aria-live="polite"
              className={
                publishState === 'failed'
                  ? 'text-end text-[11px] font-bold text-destructive'
                  : 'text-end text-[11px] text-muted-foreground'
              }
            >
              {publishLabel(publishState)}
            </p>
          )
        )}

        <DialogActions
          onCancel={() => onOpenChange(false)}
          cancelLabel={COMMUNITY_EDITOR_COPY.cancel}
        >
          <HeroCtaButton
            type="button"
            isLoading={pending}
            onClick={handleSubmit}
            className="w-full sm:w-auto"
          >
            {isEdit
              ? COMMUNITY_EDITOR_COPY.save
              : publishState === 'publishing'
                ? COMMUNITY_COMPOSER_COPY.publishing
                : COMMUNITY_COMPOSER_COPY.publish}
          </HeroCtaButton>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
