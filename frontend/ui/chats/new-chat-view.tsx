'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { getChatPreview, startDirectChat } from '@/frontend/api/chats';
import { useSession } from '@/frontend/state/session-provider';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import type { ChatPreview } from '@/shared/contracts/chat';

/**
 * `/chats/new?to=<handle>`: the empty chat screen a picker row opens.
 *
 * It creates nothing. The member is read from the directory, the thread this
 * pair already has (if any) is resolved and entered, and the request itself is
 * the one button on the screen — so a click in the picker never sends a request
 * on the member's behalf.
 */
export function NewChatView() {
  const router = useRouter();
  const params = useSearchParams();
  const handle = params.get('to') ?? '';
  const { user, isLoading: isSessionLoading } = useSession();
  const [preview, setPreview] = useState<ChatPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    if (!handle || !user) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const next = await getChatPreview(handle);
        if (cancelled) return;
        if (next.conversationId) {
          router.replace(`/chats/${next.conversationId}`);
          return;
        }
        setPreview(next);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error && cause.message ? cause.message : 'العضو غير موجود');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handle, user, router]);

  async function request() {
    if (!preview || isRequesting) return;
    setIsRequesting(true);
    setError(null);
    try {
      const result = await startDirectChat(preview.peer.id);
      if (result.conversationId) {
        router.push(`/chats/${result.conversationId}`);
        return;
      }
      setError(result.error ?? 'تعذّر إرسال الطلب');
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'تعذّر إرسال الطلب');
    } finally {
      setIsRequesting(false);
    }
  }

  if (isSessionLoading || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
        <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <p className="text-sm font-medium text-muted-foreground">جاري التَّحميل...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
        <p className="text-sm font-bold text-foreground">سجِّل الدُّخول لبدء محادثة</p>
        <Link
          href={`/auth/login?redirect=${encodeURIComponent(`/chats/new?to=${handle}`)}`}
          className="mt-4 inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground"
        >
          تسجيل الدُّخول
        </Link>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
        <p className="text-sm font-bold text-foreground">{error ?? 'العضو غير موجود'}</p>
        <Link
          href="/notifications?tab=chats"
          className="mt-3 text-xs font-bold text-primary hover:underline"
        >
          العودة إلى المحادثات
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-xs">
      <div className="flex items-center gap-3 border-b border-border/40 px-3 py-3">
        <Link
          href="/notifications?tab=chats"
          aria-label="العودة إلى المحادثات"
          className="rounded-lg p-1.5 text-muted-foreground transition-safe hover:bg-accent hover:text-foreground"
        >
          <span aria-hidden="true">→</span>
        </Link>
        <MemberAvatar
          name={preview.peer.name ?? preview.peer.username}
          avatarUrl={preview.peer.avatarUrl}
          size="sm"
          ring={false}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">
            {preview.peer.name ?? preview.peer.username}
          </p>
          <p className="truncate text-xs text-muted-foreground/70" dir="ltr">
            @{preview.peer.username}
          </p>
        </div>
      </div>

      <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 px-4 py-10 text-center">
        <MemberAvatar
          name={preview.peer.name ?? preview.peer.username}
          avatarUrl={preview.peer.avatarUrl}
          size="lg"
          ring={false}
        />
        <p className="text-sm font-bold text-foreground">
          {preview.peer.name ?? preview.peer.username}
        </p>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground/80">
          لا رسائل بعد. أرسل طلب محادثة، وسيتمكّن كل منكما من الكتابة بعد أن يقبله.
        </p>
        {error && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="border-t border-border/40 p-3">
        <div className="flex justify-center">
          <HeroCtaButton
            type="button"
            onClick={() => void request()}
            disabled={isRequesting}
            className="h-11 px-6 text-sm"
          >
            طلب محادثة
          </HeroCtaButton>
        </div>
      </div>
    </div>
  );
}
