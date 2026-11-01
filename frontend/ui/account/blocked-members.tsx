'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldOff } from 'lucide-react';

import { getBlockedChatMembers, unblockChatUser } from '@/frontend/api/chats';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import type { ChatPeer } from '@/shared/contracts/chat';

/**
 * The members the account has blocked, and the one action that lifts it.
 *
 * Blocking lives in the thread's menu, where the member is; this is the place
 * it can be undone without finding that thread again — a blocked member may not
 * appear anywhere else in the product.
 */
export function BlockedMembers() {
  const [members, setMembers] = useState<ChatPeer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lifting, setLifting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await getBlockedChatMembers());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'تعذّر تحميل القائمة');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function unblock(peer: ChatPeer) {
    setLifting(peer.id);
    try {
      await unblockChatUser(peer.id);
      setMembers((current) => current.filter((member) => member.id !== peer.id));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'تعذّر إلغاء الحظر');
    } finally {
      setLifting(null);
    }
  }

  return (
    <section id="blocked" aria-labelledby="blocked-title" className="scroll-mt-24">
      <h2
        id="blocked-title"
        className="mb-2 flex items-center gap-2 px-1 text-sm font-bold text-foreground"
      >
        <ShieldOff className="size-4 text-primary" aria-hidden="true" />
        الأعضاء المحظورون
      </h2>

      {isLoading ? (
        <div className="rounded-2xl border border-border/70 bg-card/60 px-4 py-6 text-center">
          <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <p className="text-xs font-medium text-muted-foreground">جاري التَّحميل...</p>
        </div>
      ) : error ? (
        <p
          role="alert"
          className="rounded-2xl bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive"
        >
          {error}
        </p>
      ) : members.length === 0 ? (
        <p className="rounded-2xl border border-border/70 bg-card/60 px-4 py-5 text-center text-xs text-muted-foreground/80">
          لم تحظر أحداً.
        </p>
      ) : (
        <ul className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/70 bg-card/60">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-4 py-3">
              <MemberAvatar
                name={member.name ?? member.username}
                avatarUrl={member.avatarUrl}
                size="sm"
                ring={false}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">
                  {member.name ?? member.username}
                </p>
                <p className="truncate text-xs text-muted-foreground/70" dir="ltr">
                  @{member.username}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void unblock(member)}
                disabled={lifting === member.id}
                className="shrink-0 rounded-lg border border-border/70 px-3 py-1.5 text-xs font-bold text-foreground transition-safe hover:bg-accent disabled:opacity-50"
              >
                إلغاء الحظر
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
