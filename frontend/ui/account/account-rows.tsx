'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  FileText,
  CircleQuestionMark,
  LogOut,
  MessageCircle,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { SUPPORT_USERNAME } from '@/frontend/shared/constants';
import { useSession } from '@/frontend/state/session-provider';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { PushNotificationToggle } from '@/frontend/ui/shared/push-notification-toggle';
import { AccountRow } from './account-row';
import { rowClasses } from './row-classes';
import { ACCOUNT_ROWS_COPY } from './account-rows-copy';

interface AccountRowsProps {
  /** Replaces navigation for a visitor with no session — the row opens the prompt. */
  onRequireAuth: (href: string) => void;
  /** The signed-in member's sign-out, after the question below is answered. */
  onSignOut: () => void;
  /** Rows that belong between the account actions and the public links. */
  children?: ReactNode;
}

/**
 * The account area's rows and its sign-out (#948).
 *
 * The page's action rows, the public links under them and the question before a
 * sign-out, extracted so the app can draw the same screen from the same words
 * (ADR-0098). A member gets a link and a sign-out button; a guest gets the rows
 * as buttons that open the sign-in prompt, and no sign-out.
 *
 * The news and links rows are not here any more (ADR-0153): each app opens its
 * own account screen from its own page's FAB, and the row duplicated that door.
 *
 * The shell-only rows (`InstallSection`, `ShellChangelogRow`) arrive as children
 * so they keep the page's order: after the account actions and before the FAQ.
 */
export function AccountRows({ onRequireAuth, onSignOut, children }: AccountRowsProps) {
  const { user, isAdmin } = useSession();
  const [isSignOutOpen, setIsSignOutOpen] = useState(false);

  return (
    <>
      <nav aria-label={ACCOUNT_ROWS_COPY.navLabel} className="flex flex-col gap-2.5">
        {/* The device's notification switch is a setting, not a destination, so it
            sits above the rows that navigate: it applies to the whole account and
            decides whether the device alerts at all (#1023). */}
        <PushNotificationToggle />

        <AccountRow
          href="/account/submissions"
          icon={ClipboardList}
          label={ACCOUNT_ROWS_COPY.submissions}
          onRequireAuth={onRequireAuth}
        />

        <AccountRow
          href="/account/posts"
          icon={FileText}
          label={ACCOUNT_ROWS_COPY.posts}
          onRequireAuth={onRequireAuth}
        />

        <AccountRow
          href="/account/blocked"
          icon={ShieldOff}
          label={ACCOUNT_ROWS_COPY.blocked}
          onRequireAuth={onRequireAuth}
        />

        {/* Public: a visitor may read the plans without an account, so this is a
            plain link rather than a row that opens the sign-in prompt. */}
        <PlainRow href="/pricing" icon={Sparkles} label={ACCOUNT_ROWS_COPY.pricing} />

        {isAdmin && <PlainRow href="/admin" icon={ShieldCheck} label={ACCOUNT_ROWS_COPY.admin} />}

        {children}

        {/* Public, so it is a plain link for guests and members alike — unlike
            the rows above, it has nothing to gate. */}
        <PlainRow href="/account/faq" icon={CircleQuestionMark} label={ACCOUNT_ROWS_COPY.faq} />

        {/* Support is a chat with the site's own account, in the product rather
            than on WhatsApp. A guest lands on the chat screen's sign-in prompt,
            which returns them here after signing in. */}
        <PlainRow
          href={`/chats/new?to=${encodeURIComponent(SUPPORT_USERNAME)}`}
          icon={MessageCircle}
          label={ACCOUNT_ROWS_COPY.contact}
        />

        {user && (
          <button
            type="button"
            onClick={() => setIsSignOutOpen(true)}
            className={cn(
              rowClasses,
              'text-destructive/90 hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30'
            )}
          >
            <span className="flex items-center gap-2.5">
              <LogOut aria-hidden="true" className="w-4 h-4 shrink-0 text-destructive" />
              <span>{ACCOUNT_ROWS_COPY.signOut}</span>
            </span>
          </button>
        )}
      </nav>

      <ConfirmDialog
        open={isSignOutOpen}
        title={ACCOUNT_ROWS_COPY.signOut}
        message={ACCOUNT_ROWS_COPY.signOutMessage}
        confirmLabel={ACCOUNT_ROWS_COPY.signOut}
        cancelLabel={ACCOUNT_ROWS_COPY.cancel}
        onConfirm={() => {
          setIsSignOutOpen(false);
          onSignOut();
        }}
        onCancel={() => setIsSignOutOpen(false)}
        variant="danger"
      />
    </>
  );
}

/** A row with no session gate: the page opens it for a guest too. */
function PlainRow({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className={rowClasses}>
      <span className="flex items-center gap-2.5">
        <Icon aria-hidden="true" className="w-4 h-4 shrink-0 text-primary" />
        <span>{label}</span>
      </span>
      <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
        ←
      </span>
    </Link>
  );
}
