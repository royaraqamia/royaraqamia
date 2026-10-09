'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AtSign, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { useSession } from '@/frontend/state/session-provider';
import { updateUsername } from '@/frontend/api/me';
import { UsernameSchema } from '@/shared/contracts/users';

/**
 * Edit the public handle that backs `/u/<username>`. Validation is the same Zod
 * schema the API enforces, so the field rejects an invalid handle before the
 * round-trip and the server remains the source of truth for uniqueness.
 */
export function UsernameEditor() {
  const { profileUsername } = useSession();
  const [value, setValue] = useState(profileUsername ?? '');
  const [saved, setSaved] = useState<string | null>(profileUsername ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(profileUsername ?? '');
    setSaved(profileUsername ?? null);
    setError(null);
  }, [profileUsername]);

  const normalized = value.trim().toLowerCase();
  const dirty = normalized !== (saved ?? '');

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    if (error) setError(null);
  };

  const handleSave = async () => {
    const parsed = UsernameSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'معرّف غير صالح');
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
      toast.success('تمَّ تحديث المعرِّف العام');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذَّر تحديث المعرِّف');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border/50 bg-card/60 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <AtSign className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-bold text-foreground sm:text-base">المعرِّف العام</h2>
      </div>
      <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
        رابط ملفَّك الشَّخصي الذي يراه الجميع على المجتمع. يظهر في قائمة الأعضاء ونتائج البحث.
      </p>

      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
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
            error={Boolean(error)}
            aria-label="المعرِّف العام"
            aria-describedby={error ? 'username-error' : undefined}
            className="ps-8 font-medium"
          />
        </div>
        <Button
          onClick={handleSave}
          disabled={!dirty || saving}
          variant="hero"
          className="group relative h-13 w-auto min-w-44 shrink-0 gap-2.5 overflow-hidden px-6 text-base font-bold! transition-transform duration-300 hover:translate-y-0 hover:scale-[1.02] focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:h-14 sm:min-w-50 sm:px-8 sm:text-lg"
        >
          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 ease-in-out group-hover:translate-x-full" />
          {saving ? (
            <>
              <Loader2 className="relative z-10 size-4 animate-spin" aria-hidden="true" />
              <span className="relative z-10">جاري الحفظ</span>
            </>
          ) : (
            <span className="relative z-10">حفظ</span>
          )}
        </Button>
      </div>

      {error && (
        <p id="username-error" className="mt-2 text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      {!error && saved && (
        <p className="mt-2 text-xs text-muted-foreground">
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
    </section>
  );
}
