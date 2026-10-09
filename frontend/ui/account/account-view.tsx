'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { User, ClipboardList, ShieldCheck, LogOut, MessageCircle } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { useSession } from '@/frontend/state/session-provider';
import { getWhatsAppUrl } from '@/frontend/shared/constants';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';

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
      {/* Profile card — or the sign-in prompt that stands in for it for guests */}
      {!user ? (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card/60 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
            <User size={24} />
          </div>
          <div className="space-y-1">
            <p className="text-base font-bold text-foreground sm:text-lg">
              سجِّل الدُّخول إلى حسابك
            </p>
            <p className="text-xs text-muted-foreground sm:text-sm">
              تابع طلباتك وبياناتك الشَّخصيَّة بعد تسجيل الدُّخول
            </p>
          </div>
          <SignInCta href="/auth/login?redirect=/account" className="mt-1 w-full sm:w-auto" />
        </section>
      ) : (
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
      )}

      {/* Account actions */}
      <nav aria-label="إجراءات الحساب" className="flex flex-col gap-2.5">
        {user && (
          <Link href="/account/submissions" className={rowClasses}>
            <span className="flex items-center gap-2.5">
              <ClipboardList className="w-4 h-4 shrink-0 text-primary" />
              <span>طلباتي</span>
            </span>
            <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
              ←
            </span>
          </Link>
        )}

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

        <a href={getWhatsAppUrl()} target="_blank" rel="noopener noreferrer" className={rowClasses}>
          <span className="flex items-center gap-2.5">
            <MessageCircle className="w-4 h-4 shrink-0 text-primary" />
            <span>تواصل معنا</span>
          </span>
          <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
            ←
          </span>
        </a>

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
    </div>
  );
}
