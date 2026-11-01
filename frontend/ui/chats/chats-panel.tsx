'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, MessagesSquare, Plus, Search, X } from 'lucide-react';

import { useChatThreads } from '@/frontend/state/chats/use-chat-threads';
import { searchChatMembers } from '@/frontend/api/chats';
import { calculateTimeAgo } from '@/frontend/shared/format';
import { cn } from '@/frontend/shared/cn';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import type { ChatConversationSummary, ChatPeer } from '@/shared/contracts/chat';

/**
 * The notifications page's Chats tab: the caller's threads, the requests that
 * wait on them, and the one action that starts a new one.
 *
 * It renders inside the page's tabpanel, so it owns no heading of its own and
 * never draws `<main>`.
 */
export function ChatsPanel() {
  const router = useRouter();
  const { threads, isLoading, respond } = useChatThreads(true);
  const [picking, setPicking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [answering, setAnswering] = useState<{
    thread: ChatConversationSummary;
    choice: 'accept' | 'decline';
  } | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);

  const pending = threads.filter(
    (thread) => thread.myStatus === 'requested' || thread.myStatus === 'invited'
  );
  const open = threads.filter(
    (thread) => thread.myStatus === 'active' || thread.myStatus === 'declined'
  );

  async function answer(id: string, choice: 'accept' | 'decline') {
    setIsAnswering(true);
    setFailure(await respond(id, choice));
    setIsAnswering(false);
    setAnswering(null);
  }

  /**
   * The picker opens the member's empty chat screen; nothing is created here,
   * so browsing the directory never sends a request on the member's behalf.
   */
  function openWith(peer: ChatPeer) {
    setPicking(false);
    router.push(`/chats/new?to=${encodeURIComponent(peer.username)}`);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
        <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <p className="text-sm font-medium text-muted-foreground">جاري التَّحميل...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground/80">
          {threads.length === 0 ? 'لا محادثات بعد' : `${threads.length} محادثة`}
        </p>
        <button
          type="button"
          onClick={() => setPicking((current) => !current)}
          aria-expanded={picking}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-popover px-3 py-1.5 text-xs font-bold text-foreground transition-safe hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Plus size={14} className="shrink-0" />
          <span>محادثة جديدة</span>
        </button>
      </div>

      {failure && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
        >
          {failure}
        </p>
      )}

      {picking && <MemberPicker onPick={openWith} onClose={() => setPicking(false)} />}

      {pending.length > 0 && (
        <section aria-label="طلبات المحادثة" className="space-y-2">
          {pending.map((thread) => (
            <div
              key={thread.id}
              className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3"
            >
              <ThreadIdentity thread={thread} />
              <p className="mt-1 text-xs text-muted-foreground">
                {thread.myStatus === 'invited' ? 'دعاك إلى محادثة جماعية' : 'يريد بدء محادثة معك'}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAnswering({ thread, choice: 'accept' })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-safe hover:bg-primary/90"
                >
                  <Check size={14} />
                  قبول
                </button>
                <button
                  type="button"
                  onClick={() => setAnswering({ thread, choice: 'decline' })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-1.5 text-xs font-bold text-muted-foreground transition-safe hover:bg-accent"
                >
                  <X size={14} />
                  رفض
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {answering && (
        <ConfirmDialog
          open
          title={answering.choice === 'accept' ? 'قبول المحادثة' : 'رفض المحادثة'}
          message={
            answering.choice === 'accept'
              ? `ستتمكّن أنت و${answering.thread.title} من إرسال الرسائل بعد القبول.`
              : 'سيُغلق الطلب، ولن تصلك رسائل من هذا العضو في هذه المحادثة.'
          }
          confirmLabel={answering.choice === 'accept' ? 'قبول' : 'رفض'}
          cancelLabel="إلغاء"
          isConfirming={isAnswering}
          variant={answering.choice === 'accept' ? 'default' : 'danger'}
          onCancel={() => setAnswering(null)}
          onConfirm={() => void answer(answering.thread.id, answering.choice)}
        />
      )}

      {open.length > 0 ? (
        <ul className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-xs">
          {open.map((thread) => (
            <li key={thread.id} className="transition-safe hover:bg-muted/50">
              <Link
                href={`/chats/${thread.id}`}
                className="flex items-start gap-3.5 px-4 py-3.5 focus-visible:bg-accent/80 focus-visible:outline-none"
              >
                <ThreadIdentity thread={thread} />
                <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
                  {thread.lastMessageAt && (
                    <span className="text-[11px] font-medium text-muted-foreground/60">
                      {calculateTimeAgo(thread.lastMessageAt)}
                    </span>
                  )}
                  {thread.unreadCount > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold leading-none text-primary-foreground">
                      {thread.unreadCount > 99 ? '99+' : thread.unreadCount}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        pending.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
            <div className="mb-3 rounded-full border border-border/40 bg-muted/60 p-3.5 text-muted-foreground/80 shadow-inner">
              <MessagesSquare size={24} />
            </div>
            <p className="text-sm font-bold text-foreground">لا توجد محادثات بعد</p>
            <p className="mt-1 text-xs text-muted-foreground/70">ابدأ محادثة مع عضو، وستظهر هنا.</p>
          </div>
        )
      )}
    </div>
  );
}

function ThreadIdentity({ thread }: { thread: ChatConversationSummary }) {
  const label = thread.counterpart?.name ?? thread.counterpart?.username ?? thread.title;

  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <MemberAvatar
        name={label}
        avatarUrl={thread.counterpart?.avatarUrl ?? null}
        size="sm"
        ring={false}
      />
      <div className="min-w-0 flex-1">
        {' '}
        <p className="truncate text-sm font-bold text-foreground">{thread.title}</p>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground/80">
          {thread.status === 'declined'
            ? 'رُفضت المحادثة'
            : thread.lastMessage
              ? previewOf(thread)
              : 'لا رسائل بعد'}
        </p>
      </div>
    </div>
  );
}

function previewOf(thread: ChatConversationSummary): string {
  const line = thread.lastMessage;
  if (!line) return 'لا رسائل بعد';
  if (line.hasAttachments && !line.body) return 'مرفق';
  const who = line.senderKind === 'agent' ? 'المساعد: ' : '';
  return `${who}${line.body ?? ''}`.trim();
}

/** The member search: verified handles only, two characters minimum. */
function MemberPicker({
  onPick,
  onClose,
}: {
  onPick: (peer: ChatPeer) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<ChatPeer[]>([]);
  const [busy, setBusy] = useState(false);

  async function search(value: string) {
    setTerm(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }

    setBusy(true);
    try {
      setResults(await searchChatMembers(value));
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 p-3 shadow-xs">
      <div className="flex items-center gap-2">
        <Search size={16} className="shrink-0 text-muted-foreground/70" />
        <input
          value={term}
          onChange={(event) => void search(event.target.value)}
          placeholder="ابحث باسم العضو أو معرِّفه"
          aria-label="البحث عن عضو"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق البحث"
          className="rounded-lg p-1 text-muted-foreground/70 transition-safe hover:bg-accent hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      {busy && <p className="mt-2 text-xs text-muted-foreground/70">جاري البحث...</p>}

      {!busy && term.trim().length >= 2 && results.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground/70">لا نتائج</p>
      )}

      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-border/40">
          {results.map((peer) => (
            <li key={peer.id}>
              <button
                type="button"
                onClick={() => onPick(peer)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition-safe',
                  'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none'
                )}
              >
                <MemberAvatar
                  name={peer.name ?? peer.username}
                  avatarUrl={peer.avatarUrl}
                  size="sm"
                  ring={false}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-foreground">
                    {peer.name ?? peer.username}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground/70">
                    @{peer.username}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
