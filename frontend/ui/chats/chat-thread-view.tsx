'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, MoreVertical, Pencil, Send, Trash2 } from 'lucide-react';

import { useChatThread } from '@/frontend/state/chats/use-chat-thread';
import { useSession } from '@/frontend/state/session-provider';
import { blockChatUser, leaveChat, reportChat } from '@/frontend/api/chats';
import { calculateTimeAgo } from '@/frontend/shared/format';
import { cn } from '@/frontend/shared/cn';
import { canEditChatMessage, type ChatMessage, type ChatThread } from '@/shared/contracts/chat';

/**
 * `/chats/[id]`: one thread, drawn from the same contract the tab's rows come
 * from, so a member reads the same title and the same last line in both places.
 */
export function ChatThreadView({ conversationId }: { conversationId: string }) {
  const { thread, messages, isLoading, isSending, error, hasOlder, loadOlder, send, edit, remove } =
    useChatThread(conversationId);
  const { user } = useSession();
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
        <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <p className="text-sm font-medium text-muted-foreground">جاري التَّحميل...</p>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
        <p className="text-sm font-bold text-foreground">المحادثة غير موجودة</p>
        <Link
          href="/notifications?tab=chats"
          className="mt-3 text-xs font-bold text-primary hover:underline"
        >
          العودة إلى المحادثات
        </Link>
      </div>
    );
  }

  const waiting = thread.status === 'requested';
  const writable = thread.canWrite && !waiting;

  async function handleSend() {
    const line = draft.trim();
    if (!line || isSending) return;
    if (await send(line)) setDraft('');
  }

  async function handleReport() {
    setMenuOpen(false);
    const reason = window.prompt('سبب الإبلاغ');
    if (!reason) return;
    const result = await reportChat(conversationId, reason, thread?.counterpart?.id ?? null);
    setNotice(result.success ? 'تم إرسال الإبلاغ' : (result.error ?? 'تعذّر إرسال الإبلاغ'));
  }

  async function handleBlock() {
    setMenuOpen(false);
    if (!thread?.counterpart) return;
    if (!window.confirm(`حظر ${thread.title}؟`)) return;
    const result = await blockChatUser(thread.counterpart.id);
    setNotice(result.success ? 'تم الحظر' : (result.error ?? 'تعذّر الحظر'));
  }

  async function handleLeave() {
    setMenuOpen(false);
    if (!window.confirm('مغادرة هذه المحادثة؟')) return;
    const result = await leaveChat(conversationId);
    if (result.success) window.location.assign('/notifications?tab=chats');
    else setNotice(result.error ?? 'تعذّرت المغادرة');
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-xs">
      <ThreadHeader
        thread={thread}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onReport={() => void handleReport()}
        onBlock={() => void handleBlock()}
        onLeave={() => void handleLeave()}
      />

      {(notice || error) && (
        <p
          role="alert"
          className="border-b border-border/40 bg-muted/40 px-4 py-2 text-xs font-medium text-foreground/80"
        >
          {error ?? notice}
        </p>
      )}

      <div className="flex max-h-[60vh] min-h-[18rem] flex-col gap-2 overflow-y-auto px-3 py-4">
        {hasOlder && (
          <button
            type="button"
            onClick={() => void loadOlder()}
            className="mx-auto rounded-lg px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10"
          >
            تحميل رسائل أقدم
          </button>
        )}

        {messages.length === 0 ? (
          <p className="m-auto text-xs text-muted-foreground/70">
            {waiting ? 'بانتظار موافقة الطَّرف الآخر' : 'ابدأ المحادثة برسالة'}
          </p>
        ) : (
          messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              mine={Boolean(user && message.senderId === user.id)}
              onEdit={edit}
              onDelete={remove}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {writable ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
          className="flex items-end gap-2 border-t border-border/40 p-3"
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="اكتب رسالة..."
            aria-label="نص الرسالة"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <button
            type="submit"
            disabled={isSending || draft.trim().length === 0}
            aria-label="إرسال"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-safe hover:bg-primary/90 disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </form>
      ) : (
        <p className="border-t border-border/40 px-4 py-3 text-xs font-medium text-muted-foreground">
          {thread.status === 'declined'
            ? 'رُفضت هذه المحادثة، فلا يمكن إرسال رسائل فيها.'
            : waiting
              ? 'لا يمكن إرسال رسائل قبل موافقة الطَّرف الآخر.'
              : 'أنت لست عضواً فعّالاً في هذه المحادثة.'}
        </p>
      )}
    </div>
  );
}

function ThreadHeader({
  thread,
  menuOpen,
  onToggleMenu,
  onReport,
  onBlock,
  onLeave,
}: {
  thread: ChatThread;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onReport: () => void;
  onBlock: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="relative flex items-center gap-3 border-b border-border/40 px-3 py-3">
      <Link
        href="/notifications?tab=chats"
        aria-label="العودة إلى المحادثات"
        className="rounded-lg p-1.5 text-muted-foreground transition-safe hover:bg-accent hover:text-foreground"
      >
        <ArrowRight size={18} />
      </Link>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{thread.title}</p>
        <p className="truncate text-xs text-muted-foreground/70">
          {thread.kind === 'direct' && thread.counterpart
            ? `@${thread.counterpart.username}`
            : `${thread.participants.length} أعضاء`}
        </p>
      </div>

      <button
        type="button"
        onClick={onToggleMenu}
        aria-label="خيارات المحادثة"
        aria-expanded={menuOpen}
        className="rounded-lg p-1.5 text-muted-foreground transition-safe hover:bg-accent hover:text-foreground"
      >
        <MoreVertical size={18} />
      </button>

      {menuOpen && (
        <div className="absolute end-3 top-12 z-10 w-44 overflow-hidden rounded-xl border border-border/70 bg-popover shadow-lg">
          <button
            type="button"
            onClick={onReport}
            className="block w-full px-3 py-2 text-start text-xs font-medium text-foreground hover:bg-accent"
          >
            إبلاغ عن المحادثة
          </button>
          {thread.counterpart && (
            <button
              type="button"
              onClick={onBlock}
              className="block w-full px-3 py-2 text-start text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              حظر @{thread.counterpart.username}
            </button>
          )}
          <button
            type="button"
            onClick={onLeave}
            className="block w-full px-3 py-2 text-start text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            مغادرة المحادثة
          </button>
        </div>
      )}
    </div>
  );
}

function MessageRow({
  message,
  mine,
  onEdit,
  onDelete,
}: {
  message: ChatMessage;
  mine: boolean;
  onEdit: (id: string, body: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body ?? '');

  const deleted = message.deletedAt !== null;
  const editable = mine && !deleted && canEditChatMessage(message.createdAt);

  return (
    <div className={cn('flex w-full flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      {message.replyTo && (
        <p className="max-w-[85%] truncate rounded-lg bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
          {message.replyTo.deletedAt ? 'رسالة محذوفة' : (message.replyTo.body ?? '')}
        </p>
      )}

      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
          mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground dark:bg-muted/70'
        )}
      >
        {deleted ? (
          <span className="text-xs italic opacity-70">حُذفت هذه الرسالة</span>
        ) : editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              maxLength={4000}
              className="w-full resize-none rounded-lg bg-background/90 px-2 py-1 text-sm text-foreground outline-none"
              aria-label="تعديل الرسالة"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-[11px] font-bold opacity-80"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (await onEdit(message.id, draft)) setEditing(false);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-bold"
              >
                <Check size={12} /> حفظ
              </button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        )}

        {message.attachments.length > 0 && !deleted && (
          <ul className="mt-2 space-y-1">
            {message.attachments.map((attachment) => (
              <li key={attachment.id} className="truncate text-[11px] opacity-90">
                {attachment.fileName}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
        <span>{calculateTimeAgo(message.createdAt)}</span>
        {message.editedAt && !deleted && <span>· عُدّلت</span>}
        {mine && !deleted && (
          <>
            {editable && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="تعديل الرسالة"
                className="rounded p-0.5 transition-safe hover:text-foreground"
              >
                <Pencil size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                if (window.confirm('حذف هذه الرسالة؟')) await onDelete(message.id);
              }}
              aria-label="حذف الرسالة"
              className="rounded p-0.5 transition-safe hover:text-destructive"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
