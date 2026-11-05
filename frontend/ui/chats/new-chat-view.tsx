'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

import { getChatPreview, startDirectChat } from '@/frontend/api/chats';
import { useSession } from '@/frontend/state/session-provider';
import { useBackAction } from '@/frontend/ui/navbar/use-back';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import type { ChatPreview } from '@/shared/contracts/chat';
import { CHAT_THREAD_COPY } from './chat-thread-copy';

/**
 * `/chats/new?to=<handle>`: the empty chat screen a picker row opens.
 *
 * It creates nothing. The member is read from the directory, the thread this
 * pair already has (if any) is resolved and entered, and the request itself is
 * the one button on the screen — so a click in the picker never sends a request
 * on the member's behalf.
 *
 * Drawn in the accepted thread's own frame — the same full-height surface, back
 * control, header and pinned footer (`chat-thread-view.tsx`) — so the request is
 * the same screen as the conversation it becomes, one state earlier rather than
 * a card on a scrolling page.
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
    <NewChatFrame
      peer={preview.peer}
      onRequest={() => void request()}
      isRequesting={isRequesting}
    />
  );
}

/**
 * The frame the accepted thread draws: one full-height surface, a header with the
 * back control and the counterpart, an empty middle that names who this is, and a
 * footer pinned to the bottom edge.
 */
function NewChatFrame({
  peer,
  onRequest,
  isRequesting,
}: {
  peer: ChatPreview['peer'];
  onRequest: () => void;
  isRequesting: boolean;
}) {
  const goBack = useBackAction('/notifications?tab=chats');
  const name = peer.name ?? peer.username;
  const profileHref = peer.verified ? `/u/${encodeURIComponent(peer.username)}` : null;

  const heading = (
    <>
      <MemberAvatar name={name} avatarUrl={peer.avatarUrl} size="sm" ring={false} />
      <div className="min-w-0 flex-1 text-start">
        <p className="truncate text-sm font-bold text-foreground">{name}</p>
        <p className="truncate text-xs text-muted-foreground/70 text-end" dir="ltr">
          @{peer.username}
        </p>
      </div>
    </>
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-clip bg-card/60 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border/70 sm:shadow-xs">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-card px-3 py-3">
        <button
          type="button"
          onClick={goBack}
          aria-label={CHAT_THREAD_COPY.backToChats}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-ring"
        >
          <ArrowRight className="size-5" aria-hidden="true" />
        </button>

        {profileHref ? (
          <Link
            href={profileHref}
            className="-mx-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 transition-safe hover:bg-muted/40 focus-ring"
          >
            {heading}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{heading}</div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4 dialog-scrollbar dialog-scrollbar-touch-none">
        <div className="m-auto flex max-w-sm flex-col items-center gap-3 px-4 text-center">
          <MemberAvatar name={name} avatarUrl={peer.avatarUrl} size="lg" ring={false} />
          <p className="text-sm font-bold text-foreground">{name}</p>
          <p className="text-xs leading-relaxed text-muted-foreground/80">
            لا رسائل بعد. أرسل طلب محادثة، وسيتمكّن كل منكما من الكتابة بعد أن يقبله.
          </p>
        </div>
      </div>

      <div className="shrink-0 space-y-2 border-t border-border/40 bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex justify-center">
          <HeroCtaButton
            type="button"
            onClick={onRequest}
            isLoading={isRequesting}
            className="h-11 px-6 text-sm"
          >
            طلب محادثة
          </HeroCtaButton>
        </div>
      </div>
    </div>
  );
}
