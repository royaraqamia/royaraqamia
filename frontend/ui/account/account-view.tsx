'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { User, ClipboardList, ShieldCheck, LogOut } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { useSession } from '@/frontend/state/session-provider';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';

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

const rowClasses =
  'group flex w-full items-center justify-between gap-3 px-4 py-4 text-start text-sm sm:text-base font-bold text-foreground rounded-2xl border border-border/50 bg-card/60 hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-[0.99] transition-safe duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

const rowIconClasses =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105';

export function AccountView() {
  const { user, isLoading, isAdmin, profileName, profileAvatarUrl, signOut } = useSession();
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

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
  const metadataAvatar =
    typeof metadata.avatar_url === 'string' && metadata.avatar_url.trim()
      ? metadata.avatar_url
      : null;
  const userName = profileName?.trim() || metadataName;
  const userEmail = typeof user?.email === 'string' ? user.email : null;
  const avatarUrl = profileAvatarUrl?.trim() || metadataAvatar;
  const showAvatar = Boolean(user && avatarUrl);

  return (
    <div className="space-y-6">
      {/* Profile card */}
      <section className="flex items-center gap-4 rounded-2xl border border-border/50 bg-card/60 p-4 sm:p-5">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary border border-primary/20 font-bold text-lg">
          {userName ? userName.charAt(0).toUpperCase() : <User size={24} />}
          {showAvatar && (
            <Image
              src={avatarUrl!}
              alt=""
              width={56}
              height={56}
              unoptimized
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </div>
        <div className="min-w-0 flex-1 text-start">
          <p className="truncate text-base sm:text-lg font-bold text-foreground">
            {userName || userEmail || 'المستخدِم'}
          </p>
          <p className="truncate text-xs sm:text-sm text-muted-foreground">
            {userEmail || 'حساب نشط'}
          </p>
        </div>
      </section>

      {/* Account actions */}
      <nav aria-label="إجراءات الحساب" className="flex flex-col gap-2.5">
        <Link href="/account/submissions" className={rowClasses}>
          <span className="flex items-center gap-3">
            <span className={rowIconClasses}>
              <ClipboardList size={18} />
            </span>
            <span>طلباتي</span>
          </span>
          <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
            ←
          </span>
        </Link>

        {isAdmin && (
          <Link href="/admin" className={rowClasses}>
            <span className="flex items-center gap-3">
              <span className={rowIconClasses}>
                <ShieldCheck size={18} />
              </span>
              <span>الإدارة</span>
            </span>
            <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
              ←
            </span>
          </Link>
        )}

        <button
          type="button"
          onClick={() => setIsLogoutDialogOpen(true)}
          className={cn(
            rowClasses,
            'text-destructive/90 hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30'
          )}
        >
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive transition-transform group-hover:scale-105">
              <LogOut size={18} />
            </span>
            <span>تسجيل الخروج</span>
          </span>
        </button>
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
    </div>
  );
}
