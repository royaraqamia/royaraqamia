'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, MessagesSquare, Plus, Users, X } from 'lucide-react';

import { useChatThreads } from '@/frontend/state/chats/use-chat-threads';
import { createChatGroup } from '@/frontend/api/chats';
import { calculateTimeAgo } from '@/frontend/shared/format';
import { cn } from '@/frontend/shared/cn';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { FabButton } from '@/frontend/ui/shared/fab-button';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { MemberPicker } from './member-picker';
import {
  CHAT_GROUP_MEMBERS_MAX,
  type ChatConversationSummary,
  type ChatPeer,
} from '@/shared/contracts/chat';

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
  const [panel, setPanel] = useState<'direct' | 'group' | null>(null);
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
    setPanel(null);
    router.push(`/chats/new?to=${encodeURIComponent(peer.username)}`);
  }

  /** A group is created on the click, then entered like any other thread. */
  function openCreated(conversationId: string) {
    setPanel(null);
    router.push(`/chats/${conversationId}`);
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
      <p className="text-xs font-medium text-muted-foreground/80">
        {threads.length === 0 ? 'لا محادثات بعد' : `${threads.length} محادثة`}
      </p>

      {failure && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
        >
          {failure}
        </p>
      )}

      {panel && (
        <NewConversationPanel
          mode={panel}
          onMode={setPanel}
          onPick={openWith}
          onCreated={openCreated}
          onClose={() => setPanel(null)}
        />
      )}

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
              ? answering.thread.kind === 'group'
                ? `ستنضمّ إلى «${answering.thread.title}» وترى رسائلها بعد القبول.`
                : `ستتمكّن أنت و${answering.thread.title} من إرسال الرسائل بعد القبول.`
              : answering.thread.kind === 'group'
                ? 'سيُرفض الانضمام، ولن تظهر لك رسائل هذه المجموعة.'
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

      {/* The primary action floats, like the community composer: the list owns
          the screen, and starting a chat is never a row inside it. */}
      <FabButton
        label="محادثة جديدة"
        aria-expanded={panel !== null}
        onClick={() => setPanel((current) => (current ? null : 'direct'))}
      >
        <Plus className="size-6" />
      </FabButton>
    </div>
  );
}

/**
 * The floating action's panel: a direct thread or a named group. Both start from
 * the same member search, so the two flows cannot drift apart.
 */
function NewConversationPanel({
  mode,
  onMode,
  onPick,
  onCreated,
  onClose,
}: {
  mode: 'direct' | 'group';
  onMode: (mode: 'direct' | 'group') => void;
  onPick: (peer: ChatPeer) => void;
  onCreated: (conversationId: string) => void;
  onClose: () => void;
}) {
  const tabs: { mode: 'direct' | 'group'; label: string }[] = [
    { mode: 'direct', label: 'محادثة' },
    { mode: 'group', label: 'مجموعة' },
  ];

  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 p-3 shadow-xs">
      <div role="tablist" aria-label="نوع المحادثة" className="mb-3 flex items-center gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            aria-selected={mode === tab.mode}
            onClick={() => onMode(tab.mode)}
            className={cn(
              'rounded-lg px-3 py-1 text-xs font-bold transition-safe',
              mode === tab.mode
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'direct' ? (
        <MemberPicker onPick={onPick} onClose={onClose} />
      ) : (
        <GroupForm onCreated={onCreated} onClose={onClose} />
      )}
    </div>
  );
}

/** A name and 1-31 members; the creator is the 32nd and never picked. */
function GroupForm({
  onCreated,
  onClose,
}: {
  onCreated: (conversationId: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<ChatPeer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(peer: ChatPeer) {
    setSelected((current) =>
      current.some((member) => member.id === peer.id)
        ? current.filter((member) => member.id !== peer.id)
        : [...current, peer]
    );
  }

  async function submit() {
    if (busy) return;

    if (!title.trim()) {
      setError('اسم المجموعة مطلوب');
      return;
    }
    if (selected.length === 0) {
      setError('أضف عضواً واحداً على الأقل');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await createChatGroup(
        title.trim(),
        selected.map((member) => member.id)
      );
      if (result.conversationId) {
        onCreated(result.conversationId);
        return;
      }
      setError(result.error ?? 'تعذّر إنشاء المجموعة');
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'تعذّر إنشاء المجموعة');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label htmlFor="chat-group-title" className="sr-only">
          اسم المجموعة
        </label>
        <input
          id="chat-group-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          placeholder="اسم المجموعة"
          aria-label="اسم المجموعة"
          className="min-w-0 flex-1 rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary/40"
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

      <MemberPicker multiple selected={selected} onToggle={toggle} />

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="المدعوون">
          {selected.map((member) => (
            <li
              key={member.id}
              className="flex max-w-56 items-center gap-1 rounded-lg bg-muted/60 px-2 py-1 text-[11px] text-foreground/80"
            >
              <span className="truncate">{member.name ?? member.username}</span>
              <button
                type="button"
                onClick={() => toggle(member)}
                aria-label={`إزالة ${member.name ?? member.username}`}
                className="shrink-0 rounded p-0.5 hover:text-destructive"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground/70">
          حتى {CHAT_GROUP_MEMBERS_MAX - 1} عضواً غيرك
        </p>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-safe hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? 'جاري الإنشاء...' : 'إنشاء المجموعة'}
        </button>
      </div>
    </div>
  );
}

function ThreadIdentity({ thread }: { thread: ChatConversationSummary }) {
  const label = thread.counterpart?.name ?? thread.counterpart?.username ?? thread.title;

  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {thread.kind === 'group' ? (
        <span
          aria-hidden
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80"
        >
          <Users size={16} />
        </span>
      ) : (
        <MemberAvatar
          name={label}
          avatarUrl={thread.counterpart?.avatarUrl ?? null}
          size="sm"
          ring={false}
        />
      )}
      <div className="min-w-0 flex-1">
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
