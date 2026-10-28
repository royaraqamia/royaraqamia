'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  User,
  ClipboardList,
  FileText,
  Link2,
  Plug,
  ShieldCheck,
  Shield,
  ScrollText,
  LogOut,
  HelpCircle,
  MessageCircle,
  Lock,
  Sparkles,
  Newspaper,
} from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { useSession } from '@/frontend/state/session-provider';
import { getWhatsAppUrl } from '@/frontend/shared/constants';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { Dialog, DialogContent, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { AccountRow } from '@/frontend/ui/account/account-row';
import { UsageCard } from '@/frontend/ui/account/usage-card';
import { UsernameEditor } from '@/frontend/ui/account/username-editor';
import { ProfileEditor } from '@/frontend/ui/account/profile-editor';
import { InstallSection } from '@/frontend/ui/account/install-section';
import { ShellChangelogRow } from '@/frontend/ui/account/changelog-view';
import { rowClasses } from '@/frontend/ui/account/row-classes';

/** The legal pages, public like the FAQ row — a plain link for guests and members. */
const legalRows = [
  { href: '/privacy', icon: Lock, label: 'سياسة الخصوصيَّة' },
  { href: '/terms', icon: ScrollText, label: 'شروط الاستخدام' },
  { href: '/security', icon: Shield, label: 'سياسة الأمان' },
];

function AccountSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="جاري التَّحميل...">
      <div className="h-8 w-32 rounded-lg bg-muted/60 animate-pulse" />
      <div className="h-28 rounded-2xl bg-muted/40 animate-pulse border border-border/40" />
      <div className="h-16 rounded-2xl bg-muted/40 animate-pulse border border-border/40" />
      <div className="h-16 rounded-2xl bg-muted/40 animate-pulse border border-border/40" />
    </div>
  );
}

export function AccountView() {
  const { user, isLoading, isAdmin, profileName, profileAvatarUrl, signOut } = useSession();
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  /** The destination a guest picked; also what the sign-in prompt returns them to. */
  const [promptHref, setPromptHref] = useState<string | null>(null);

  if (isLoading) {
    return <AccountSkeleton />;
  }

  const metadata = user?.user_metadata ?? {};
  const metadataName =
    typeof metadata.name === 'string' && metadata.name.trim()
      ? metadata.name
      : typeof metadata.full_name === 'string' && metadata.full_name.trim()
        ? metadata.full_name
        : null;
  const userName = profileName?.trim() || metadataName;
  const userEmail = typeof user?.email === 'string' ? user.email : null;
  // The profile row is the source of truth: the editor writes it and can clear
  // it, so we must not fall back to auth metadata or "delete avatar" could not
  // take effect for OAuth accounts.
  const avatarUrl = profileAvatarUrl?.trim() || null;
  const loginHref = `/auth/login?redirect=${encodeURIComponent(promptHref ?? '/account')}`;

  return (
    <div className="space-y-6">
      {/* Profile card — or the sign-in prompt that stands in for it for guests */}
      {!user ? (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card/60 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
            <User size={24} />
          </div>
          <p className="text-base font-bold text-foreground sm:text-lg">سجِّل الدُّخول إلى حسابك</p>
          <SignInCta href="/auth/login?redirect=/account" className="mt-1 w-full sm:w-auto" />
        </section>
      ) : (
        <ProfileEditor userName={userName} userEmail={userEmail} avatarUrl={avatarUrl} />
      )}

      {/* Public handle editor — signed-in members only */}
      {user && <UsernameEditor />}

      {/* The allowance is the account's own data, so the card draws nothing at
          all for a visitor — `/pricing` is where a guest learns what it offers. */}
      <UsageCard />

      {/* Account actions — every row is public; the ones behind a session open the
          sign-in prompt instead of navigating. */}
      <nav aria-label="إجراءات الحساب" className="flex flex-col gap-2.5">
        <AccountRow
          href="/account/submissions"
          icon={ClipboardList}
          label="الطَّلبات"
          onRequireAuth={setPromptHref}
        />

        <AccountRow
          href="/account/posts"
          icon={FileText}
          label="المنشورات"
          onRequireAuth={setPromptHref}
        />

        <AccountRow
          href="/account/news"
          icon={Newspaper}
          label="مصادر الأخبار"
          onRequireAuth={setPromptHref}
        />

        <AccountRow
          href="/account/links"
          icon={Link2}
          label="الرَّوابط المختصَرة"
          onRequireAuth={setPromptHref}
        />

        <AccountRow
          href="/account/connected-apps"
          icon={Plug}
          label="التَّطبيقات المتَّصلة بالـ MCP"
          onRequireAuth={setPromptHref}
        />

        {/* Public: a visitor may read the plans without an account, so this is a
            plain link rather than a row that opens the sign-in prompt. */}
        <Link href="/pricing" className={rowClasses}>
          <span className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 shrink-0 text-primary" />
            <span>خطط التَّسعير</span>
          </span>
          <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
            ←
          </span>
        </Link>

        {isAdmin && (
          <Link href="/admin" className={rowClasses}>
            <span className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 shrink-0 text-primary" />
              <span>الإدارة</span>
            </span>
            <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
              ←
            </span>
          </Link>
        )}

        <InstallSection />

        {/* Only inside the shell: a browser visitor is not running an APK whose
            changelog this is (ADR-0090). */}
        <ShellChangelogRow />

        {/* Public, so it is a plain link for guests and members alike — unlike
            the rows above, it has nothing to gate. */}
        <Link href="/account/faq" className={rowClasses}>
          <span className="flex items-center gap-2.5">
            <HelpCircle className="w-4 h-4 shrink-0 text-primary" />
            <span>الأسئلة الشَّائعة</span>
          </span>
          <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
            ←
          </span>
        </Link>

        <a href={getWhatsAppUrl()} target="_blank" rel="noopener noreferrer" className={rowClasses}>
          <span className="flex items-center gap-2.5">
            <MessageCircle className="w-4 h-4 shrink-0 text-primary" />
            <span>تواصل معنا</span>
          </span>
          <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
            ←
          </span>
        </a>

        {/* Legal pages — public, so plain links for guests and members alike. */}
        {legalRows.map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href} className={rowClasses}>
            <span className="flex items-center gap-2.5">
              <Icon className="w-4 h-4 shrink-0 text-primary" />
              <span>{label}</span>
            </span>
            <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
              ←
            </span>
          </Link>
        ))}

        {user && (
          <button
            type="button"
            onClick={() => setIsLogoutDialogOpen(true)}
            className={cn(
              rowClasses,
              'text-destructive/90 hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30'
            )}
          >
            <span className="flex items-center gap-2.5">
              <LogOut className="w-4 h-4 shrink-0 text-destructive" />
              <span>تسجيل الخروج</span>
            </span>
          </button>
        )}
      </nav>

      <ConfirmDialog
        open={isLogoutDialogOpen}
        title="تسجيل الخروج"
        message="هل أنت متأكِّد أنَّك تريد تسجيل الخروج؟"
        confirmLabel="تسجيل الخروج"
        cancelLabel="إلغاء"
        onConfirm={() => {
          setIsLogoutDialogOpen(false);
          signOut().then(() => {
            window.location.href = '/';
          });
        }}
        onCancel={() => setIsLogoutDialogOpen(false)}
        variant="danger"
      />

      {/* Guest gate for the rows above — the same nudge the community FAB and the
          notification bell give, aimed at the page they picked. */}
      <Dialog
        open={promptHref !== null}
        onOpenChange={(next) => {
          if (!next) setPromptHref(null);
        }}
      >
        <DialogContent className="sm:max-w-md" hideClose aria-describedby={undefined}>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
              <Lock size={24} />
            </div>
            <DialogTitle className="leading-snug!">سجِّل الدُّخول للمتابعة</DialogTitle>
          </div>

          <DialogActions onCancel={() => setPromptHref(null)}>
            <SignInCta
              href={loginHref}
              onClick={() => setPromptHref(null)}
              className="w-full sm:w-auto"
            />
          </DialogActions>
        </DialogContent>
      </Dialog>
    </div>
  );
}
