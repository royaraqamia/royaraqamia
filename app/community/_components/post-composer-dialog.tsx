'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { Label } from '@/frontend/ui/primitives/label';
import { Button } from '@/frontend/ui/primitives/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { HijriDatePicker } from '@/frontend/ui/primitives/hijri-date-picker';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { tolerateChunkFailure } from '@/frontend/ui/shared/lazy-chunk';
import { createPost, updatePost } from '@/frontend/api/blogpress';
import { showActionError } from '@/frontend/ui/plans/show-plan-error';
import { useLocalIdentity } from '@/frontend/state/use-local-identity';
import { useComposerDrafts } from '@/frontend/state/blogpress/use-composer-drafts';
import { formatHijriDate } from '@/frontend/shared/format';
import { stripMarkdown } from '@/shared/reading-time';
import type { PostStatus } from '@/shared/contracts/blogpress';
import { COMMUNITY_EDITOR_COPY } from './community-editor-copy';
import { COMMUNITY_COMPOSER_COPY } from './community-composer-copy';

const BODY_MAX = 20000;
const DESCRIPTION_PREVIEW = 160;
const SCHEDULE_MINUTE_STEP = 15;

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

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** The local calendar day as `YYYY-MM-DD`, the value the picker stores. */
function localIsoDate(date = new Date()): string {
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

/** The next quarter hour, the default a newly opened schedule dialog shows. */
function defaultSchedule(): { date: string; hour: string; minute: string } {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  next.setMinutes(Math.ceil(next.getMinutes() / SCHEDULE_MINUTE_STEP) * SCHEDULE_MINUTE_STEP, 0, 0);
  return {
    date: localIsoDate(next),
    hour: twoDigits(next.getHours()),
    minute: twoDigits(next.getMinutes()),
  };
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
  /** The status the post is in when opened from the account list. */
  initialStatus?: PostStatus;
  initialPublishAt?: string | null;
  /** Called after a draft is saved or scheduled, so the list can repaint. */
  onDraftSaved?: () => void;
}

/**
 * Every community post gets the same URL-safe identifier shape — `post-xxxxxxxx`
 * — so the (title-less) post's slug never depends on its content language.
 */
function buildSlug(): string {
  return `post-${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)).slice(0, 8)}`;
}

/**
 * Facebook-style composer for the public community. It is also the account's
 * only editor now: the same form creates, edits, saves drafts and schedules.
 * A draft is local-first (its body lands in IndexedDB before the network), and
 * the schedule picker speaks Umm al-Qura like every other date on the site.
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
  initialStatus = 'published',
  initialPublishAt = null,
  onDraftSaved,
}: PostComposerDialogProps) {
  const isEdit = mode === 'edit';
  const isDraft = isEdit && initialStatus !== 'published';
  const { identity } = useLocalIdentity();
  const drafts = useComposerDrafts(identity, open);

  const [body, setBody] = useState(initialBody);
  const [saveState, setSaveState] = useState<SaveState>('atRest');
  const [publishState, setPublishState] = useState<PublishState>('atRest');
  const [pending, startTransition] = useTransition();
  const [draftId, setDraftId] = useState(postId ?? null);
  const [draftSlug, setDraftSlug] = useState(slug ?? null);
  const [draftStatus, setDraftStatus] = useState<PostStatus>(isEdit ? initialStatus : 'draft');
  const [publishAt, setPublishAt] = useState<string | null>(initialPublishAt);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => defaultSchedule().date);
  const [scheduleHour, setScheduleHour] = useState(() => defaultSchedule().hour);
  const [scheduleMinute, setScheduleMinute] = useState(() => defaultSchedule().minute);
  const edited = useRef(false);
  const lastSavedBody = useRef(initialBody);

  useEffect(() => {
    if (!open) return;
    setBody(initialBody);
    setSaveState('atRest');
    setPublishState('atRest');
    setDraftId(postId ?? null);
    setDraftSlug(slug ?? null);
    setDraftStatus(isEdit ? initialStatus : 'draft');
    setPublishAt(initialPublishAt);
    edited.current = false;
    lastSavedBody.current = initialBody;
  }, [open, initialBody, postId, slug, isEdit, initialStatus, initialPublishAt]);

  const charCount = body.length;
  const description = stripMarkdown(body.trim()).slice(0, DESCRIPTION_PREVIEW);

  const persistDraft = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed) throw new Error('empty');
    const saved = await drafts.saveDraft({
      id: draftId ?? undefined,
      slug: draftSlug ?? undefined,
      content: trimmed,
      coverImage,
      metaTitle,
      metaDesc: description,
      status: draftStatus,
      publishAt,
    });
    setDraftId(saved.id);
    setDraftSlug(saved.slug);
    return saved;
  }, [
    body,
    draftId,
    draftSlug,
    coverImage,
    metaTitle,
    description,
    draftStatus,
    publishAt,
    drafts,
  ]);

  const handleBody = (value: string) => {
    setBody(value);
    edited.current = true;
    if (isDraft) {
      setSaveState(value === initialBody ? 'atRest' : 'draft');
    } else if (publishState === 'failed') {
      // A change after a refusal is an attempt to try again: the sentence about
      // the last failure belongs to the text that produced it.
      setPublishState('atRest');
    }
  };

  // A draft the writer is editing saves itself, so a closed tab does not take
  // the body with it. The write is local-first; the sync engine carries it.
  useEffect(() => {
    if (!open || !isDraft || !edited.current) return;
    if (body === lastSavedBody.current) return;
    const timer = setTimeout(() => {
      if (!body.trim()) return;
      setSaveState('saving');
      void persistDraft()
        .then(() => {
          lastSavedBody.current = body;
          setSaveState('atRest');
        })
        .catch(() => setSaveState('failed'));
    }, 1200);
    return () => clearTimeout(timer);
  }, [body, open, isDraft, persistDraft]);

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

    if (isEdit && !isDraft) {
      setSaveState('saving');
      startTransition(async () => {
        try {
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
        } catch (error) {
          setSaveState('failed');
          showActionError(error, COMMUNITY_EDITOR_COPY.saveFailed);
        }
      });
      return;
    }

    if (isDraft) {
      setSaveState('saving');
      startTransition(async () => {
        try {
          const saved = await persistDraft();
          setSaveState('atRest');
          toast.success('تمَّ حفظ المسودَّة');
          onOpenChange(false);
          onDraftSaved?.();
          if (saved.slug) setDraftSlug(saved.slug);
        } catch (error) {
          setSaveState('failed');
          showActionError(error, COMMUNITY_EDITOR_COPY.saveFailed);
        }
      });
      return;
    }

    // A brand-new post publishes in one request, as before.
    setPublishState('publishing');
    startTransition(async () => {
      try {
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
        setPublishState('failed');
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          toast.error(COMMUNITY_COMPOSER_COPY.needsConnection);
        } else {
          showActionError(error, COMMUNITY_COMPOSER_COPY.publishFailed);
        }
      }
    });
  };

  const handleSaveDraft = () => {
    if (!body.trim()) {
      toast.error(COMMUNITY_EDITOR_COPY.emptyBody);
      return;
    }
    setSaveState('saving');
    startTransition(async () => {
      try {
        await persistDraft();
        setDraftStatus('draft');
        setSaveState('atRest');
        toast.success('تمَّ حفظ المسودَّة');
        onOpenChange(false);
        onDraftSaved?.();
      } catch (error) {
        setSaveState('failed');
        showActionError(error, COMMUNITY_EDITOR_COPY.saveFailed);
      }
    });
  };

  const handlePublishDraft = () => {
    if (!body.trim()) {
      toast.error(COMMUNITY_EDITOR_COPY.emptyBody);
      return;
    }
    setSaveState('saving');
    startTransition(async () => {
      try {
        const saved = await persistDraft();
        await drafts.publishDraft(saved.id);
        setDraftStatus('published');
        toast.success(COMMUNITY_COMPOSER_COPY.published);
        onOpenChange(false);
        onSaved(saved.slug);
        onDraftSaved?.();
      } catch (error) {
        setSaveState('failed');
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          toast.error(COMMUNITY_COMPOSER_COPY.needsConnection);
        } else {
          showActionError(error, COMMUNITY_COMPOSER_COPY.publishFailed);
        }
      }
    });
  };

  const openSchedule = () => {
    if (!body.trim()) {
      toast.error(COMMUNITY_EDITOR_COPY.emptyBody);
      return;
    }
    const next = defaultSchedule();
    setScheduleDate(next.date);
    setScheduleHour(next.hour);
    setScheduleMinute(next.minute);
    setScheduleOpen(true);
  };

  const handleSchedule = () => {
    const at = new Date(`${scheduleDate}T${scheduleHour}:${scheduleMinute}:00`);
    if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
      toast.error('اختر وقتاً في المستقبل');
      return;
    }
    setSaveState('saving');
    startTransition(async () => {
      try {
        const saved = await persistDraft();
        await drafts.scheduleDraft(saved.id, at.toISOString());
        await drafts.saveDraft({
          id: saved.id,
          slug: saved.slug,
          content: body.trim(),
          coverImage,
          metaTitle,
          metaDesc: description,
          status: 'scheduled',
          publishAt: at.toISOString(),
        });
        setDraftStatus('scheduled');
        setPublishAt(at.toISOString());
        setSaveState('atRest');
        toast.success('تمَّت جدولة المنشور');
        setScheduleOpen(false);
        onOpenChange(false);
        onDraftSaved?.();
      } catch (error) {
        setSaveState('failed');
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          toast.error('يتطلَّب تغيير الجدولة اتصالاً بالإنترنت');
        } else {
          showActionError(error, 'فشلت جدولة المنشور');
        }
      }
    });
  };

  const secondaryActions = isDraft ? (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={handlePublishDraft}
        disabled={pending}
        className="w-full sm:w-auto rounded-xl px-4 h-13 sm:h-14 text-[14px]"
      >
        نشر الآن
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={openSchedule}
        disabled={pending}
        className="w-full sm:w-auto rounded-xl px-4 h-13 sm:h-14 text-[14px]"
      >
        جدولة
      </Button>
    </>
  ) : !isEdit ? (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={handleSaveDraft}
        disabled={pending}
        className="w-full sm:w-auto rounded-xl px-4 h-13 sm:h-14 text-[14px]"
      >
        حفظ كمسودَّة
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={openSchedule}
        disabled={pending}
        className="w-full sm:w-auto rounded-xl px-4 h-13 sm:h-14 text-[14px]"
      >
        جدولة
      </Button>
    </>
  ) : undefined;

  const statusLine = isDraft
    ? draftStatus === 'scheduled' && publishAt
      ? `مجدولة بتاريخ ${formatHijriDate(publishAt, { hour: '2-digit', minute: '2-digit' })}`
      : 'مسودَّة'
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
        <DialogContent phone="sheet">
          <DialogHeader>
            <DialogTitle className="text-center">
              {isEdit ? COMMUNITY_EDITOR_COPY.title : COMMUNITY_COMPOSER_COPY.title}
            </DialogTitle>
          </DialogHeader>

          <div className="min-w-0 space-y-4 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col">
            {statusLine ? (
              <p className="text-xs font-medium text-muted-foreground">{statusLine}</p>
            ) : null}
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
            secondary={secondaryActions}
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

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>جدولة المنشور</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-date">تاريخ النَّشر</Label>
              <HijriDatePicker
                id="schedule-date"
                value={scheduleDate}
                onChange={setScheduleDate}
                min={localIsoDate()}
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="schedule-hour">السَّاعة</Label>
                <select
                  id="schedule-hour"
                  value={scheduleHour}
                  onChange={(event) => setScheduleHour(event.target.value)}
                  className="h-11 w-full rounded-xl border border-input/80 bg-background px-3 text-sm"
                >
                  {Array.from({ length: 24 }, (_, hour) => twoDigits(hour)).map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="schedule-minute">الدَّقيقة</Label>
                <select
                  id="schedule-minute"
                  value={scheduleMinute}
                  onChange={(event) => setScheduleMinute(event.target.value)}
                  className="h-11 w-full rounded-xl border border-input/80 bg-background px-3 text-sm"
                >
                  {Array.from(
                    { length: 60 / SCHEDULE_MINUTE_STEP },
                    (_, index) => index * SCHEDULE_MINUTE_STEP
                  )
                    .map((minute) => twoDigits(minute))
                    .map((minute) => (
                      <option key={minute} value={minute}>
                        {minute}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {scheduleDate
                ? formatHijriDate(
                    new Date(`${scheduleDate}T${scheduleHour}:${scheduleMinute}:00`),
                    { hour: '2-digit', minute: '2-digit' }
                  )
                : ''}
            </p>
          </div>
          <DialogActions onCancel={() => setScheduleOpen(false)}>
            <HeroCtaButton type="button" isLoading={pending} onClick={handleSchedule}>
              جدولة
            </HeroCtaButton>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </>
  );
}
