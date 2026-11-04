'use client';

import { useState } from 'react';
import { User, Lock } from 'lucide-react';

import { useSession } from '@/frontend/state/session-provider';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { Dialog, DialogContent, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { UsageCard } from '@/frontend/ui/account/usage-card';
import { UsernameEditor } from '@/frontend/ui/account/username-editor';
import { ProfileEditor } from '@/frontend/ui/account/profile-editor';
import { InstallSection } from '@/frontend/ui/account/install-section';
import { ShellChangelogRow } from '@/frontend/ui/account/shell-changelog-row';
import { AccountRows } from '@/frontend/ui/account/account-rows';

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
  const { user, isLoading, profileName, profileAvatarUrl, signOut } = useSession();
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
            <User size={24} aria-hidden="true" />
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
      <AccountRows
        onRequireAuth={setPromptHref}
        onSignOut={() => {
          signOut().then(() => {
            window.location.href = '/';
          });
        }}
      >
        <InstallSection />

        {/* Only inside the shell: a browser visitor is not running an APK whose
            changelog this is (ADR-0090). */}
        <ShellChangelogRow />
      </AccountRows>

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
              <Lock size={24} aria-hidden="true" />
            </div>
            <DialogTitle className="leading-snug!">سجِّل الدُّخول للمتابعة</DialogTitle>
          </div>

          <DialogActions onCancel={() => setPromptHref(null)}>
            <SignInCta
              href={loginHref}
              dismiss={() => setPromptHref(null)}
              className="w-full sm:w-auto"
            />
          </DialogActions>
        </DialogContent>
      </Dialog>
    </div>
  );
}
