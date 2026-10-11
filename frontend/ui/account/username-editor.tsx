'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AtSign, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/frontend/ui/primitives/input';
import { Dialog, DialogContent, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { cn } from '@/frontend/shared/cn';
import { useSession } from '@/frontend/state/session-provider';
import { useUsernameAvailability } from '@/frontend/state/account/use-username-availability';
import { updateUsername } from '@/frontend/api/me';
import { UsernameSchema } from '@/shared/contracts/users';

const rowClasses =
  'group flex w-full items-center justify-between gap-3 px-4 py-4 text-start text-sm sm:text-base font-bold text-foreground rounded-2xl border border-border/50 bg-card/60 hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-[0.99] transition-safe duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

const dialogClassName =
  'sm:max-w-md w-[calc(100%-2rem)] mx-auto p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-border/80 bg-background shadow-2xl';

/**
 * Edit the public handle that backs `/u/<username>`. Rendered as a settings row
 * that opens a dialog; validation is the same Zod schema the API enforces, so the
 * field rejects an invalid handle before the round-trip and the server stays the
 * source of truth for uniqueness.
 */
export function UsernameEditor() {
  const { profileUsername } = useSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [value, setValue] = useState(profileUsername ?? '');
  const [saved, setSaved] = useState<string | null>(profileUsername ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { status, error: availabilityError } = useUsernameAvailability(value, saved);

  useEffect(() => {
    setValue(profileUsername ?? '');
    setSaved(profileUsername ?? null);
    setError(null);
  }, [profileUsername]);

  const normalized = value.trim().toLowerCase();
  const dirty = normalized !== (saved ?? '');

  const liveError = status === 'invalid' || status === 'taken' ? (availabilityError ?? null) : null;
  const shownError = error ?? liveError;
  const blocked = status === 'checking' || status === 'taken' || status === 'invalid';

  const feedback = shownError
    ? { tone: 'error' as const, text: shownError }
    : status === 'checking' && dirty
      ? { tone: 'muted' as const, text: 'جاري التَّحقُّق من التَّوفُّر…' }
      : status === 'available' && dirty
        ? { tone: 'success' as const, text: 'المعرِّف متاح' }
        : null;

  const openDialog = () => {
    setValue(saved ?? '');
    setError(null);
    setDialogOpen(true);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    if (error) setError(null);
  };

  const handleSave = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const parsed = UsernameSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'معرِّف غير صالح');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const result = await updateUsername(parsed.data);
      if (!result.success || !result.username) {
        setError(result.error ?? 'تعذَّر تحديث المعرِّف');
        return;
      }
      setSaved(result.username);
      setValue(result.username);
      setDialogOpen(false);
      toast.success('تمَّ تحديث المعرِّف العام');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذَّر تحديث المعرِّف');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" onClick={openDialog} className={rowClasses} aria-haspopup="dialog">
        <span className="flex items-center gap-2.5">
          <AtSign className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" />
          <span>المعرِّف العام</span>
        </span>
        <span className="flex items-center gap-2">
          <span dir="ltr" className="text-xs font-medium text-muted-foreground sm:text-sm">
            {saved ? `@${saved}` : 'لم يُحدَّد'}
          </span>
          <Pencil className="size-4 text-primary/70" aria-hidden="true" />
        </span>
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          hideClose
          aria-describedby={undefined}
          className={cn(dialogClassName, 'gap-0')}
        >
          <DialogTitle className="sr-only">المعرِّف العام</DialogTitle>

          <form onSubmit={handleSave} className="space-y-3">
            <div className="space-y-2.5">
              <label
                htmlFor="username"
                className="block text-[13px] font-medium text-foreground/80"
              >
                المعرِّف العام
              </label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute inset-s-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground"
                  dir="ltr"
                  aria-hidden="true"
                >
                  @
                </span>
                <Input
                  id="username"
                  name="username"
                  value={value}
                  onChange={handleChange}
                  onBlur={() => setValue((current) => current.trim().toLowerCase())}
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={30}
                  autoFocus
                  error={Boolean(shownError)}
                  aria-label="المعرِّف العام"
                  aria-describedby={feedback ? 'username-feedback' : undefined}
                  className="ps-8 font-medium"
                />
              </div>
            </div>

            {feedback && (
              <p
                id="username-feedback"
                className={cn(
                  'text-xs font-medium',
                  feedback.tone === 'error' && 'text-destructive',
                  feedback.tone === 'success' && 'text-emerald-500',
                  feedback.tone === 'muted' && 'text-muted-foreground'
                )}
              >
                {feedback.text}
              </p>
            )}

            {!shownError && saved && (
              <p className="text-xs text-muted-foreground">
                ملفَّك الشَّخصي:{' '}
                <Link
                  href={`/u/${encodeURIComponent(saved)}`}
                  className="font-bold text-primary hover:underline"
                  dir="ltr"
                >
                  /u/{saved}
                </Link>
              </p>
            )}

            <DialogActions onCancel={() => setDialogOpen(false)}>
              <HeroCtaButton
                type="submit"
                disabled={!dirty || saving || blocked}
                className="w-full sm:w-auto"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  'حفظ'
                )}
              </HeroCtaButton>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
