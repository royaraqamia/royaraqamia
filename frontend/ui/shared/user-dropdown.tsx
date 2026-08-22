'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { cn } from '@/frontend/shared/cn';
import { User, LogOut, Download } from 'lucide-react';
import { useSession } from '@/frontend/state/session-provider';
import { usePWAContext } from '../PWAProvider';
import { ConfirmDialog } from './confirm-dialog';
import { usePortalPopover } from './use-portal-popover';

const AUTH_PATHS = [
  '/auth/login',
  '/auth/signup',
  '/auth/verify-otp',
  '/auth/reset-password',
  '/auth/update-password',
];

export function UserDropdown() {
  const { user, isLoading, signOut } = useSession();
  const { canInstall, promptInstall, isInstalled } = usePWAContext();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { panelRef, style } = usePortalPopover(isOpen, ref, { width: 256 });

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isInsideTrigger = ref.current?.contains(target);
      const isInsidePanel = panelRef.current?.contains(target);
      if (!isInsideTrigger && !isInsidePanel) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside, { passive: true });
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, panelRef]);

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center p-1.5"
        aria-busy="true"
        aria-label="جاري التَّحميل..."
      >
        <div className="h-10 w-10 rounded-full bg-muted/60 animate-pulse border border-border/40 shadow-inner" />
      </div>
    );
  }

  // Safe extraction of display metadata from the user object if available
  const userName =
    typeof user === 'object' && user !== null && 'name' in user && typeof user.name === 'string'
      ? user.name
      : null;
  const userEmail =
    typeof user === 'object' && user !== null && 'email' in user && typeof user.email === 'string'
      ? user.email
      : null;

  return (
    <div ref={ref} className="relative inline-block text-right">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative group flex items-center justify-center h-10 w-10 rounded-full border border-border/60 bg-background/80 backdrop-blur-md text-foreground shadow-xs transition-all duration-200 ease-out hover:border-primary/40 hover:bg-muted/80 hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isOpen && 'bg-muted border-primary/50 ring-2 ring-primary/20 shadow-sm scale-[1.02]'
        )}
        aria-label="قائمة المستخدِم"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <User
          size={20}
          className="text-foreground/90 transition-transform duration-200 group-hover:scale-110"
        />
        {user && (
          <span className="absolute bottom-0.5 inset-e-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            data-glass-panel
            style={style}
            className="z-50 rounded-2xl bg-popover/90 backdrop-blur-lg border border-border/60 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 p-1.5 animate-in fade-in-0 zoom-in-95 origin-top-end overflow-y-auto"
            role="menu"
            aria-label="قائمة المستخدِم"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsOpen(false);
              }
            }}
          >
            {user ? (
              <div className="space-y-1">
                {/* Profile Card Header */}
                <div className="px-3 py-2.5 mb-1 rounded-xl bg-muted/40 border border-border/40 flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold text-xs">
                    {userName ? userName.charAt(0).toUpperCase() : <User size={16} />}
                  </div>
                  <div className="min-w-0 flex-1 text-right">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {userName || userEmail || 'المستخدِم'}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {userEmail || 'حساب نشط'}
                    </p>
                  </div>
                </div>

                {/* Sign Out Item */}
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setIsLogoutDialogOpen(true);
                  }}
                  className="group flex w-full items-center justify-between gap-3 px-3 py-2.5 text-xs sm:text-sm font-medium text-destructive/90 hover:text-destructive hover:bg-destructive/10 active:bg-destructive/15 rounded-xl transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
                  role="menuitem"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive group-hover:scale-105 transition-transform">
                      <LogOut size={16} />
                    </div>
                    <span>تسجيل الخروج</span>
                  </div>
                </button>
              </div>
            ) : (
              /* Login Link */
              <a
                href={
                  pathname && !AUTH_PATHS.some((p) => pathname.startsWith(p)) && pathname !== '/'
                    ? `/auth/login?redirect=${encodeURIComponent(pathname)}`
                    : '/auth/login'
                }
                onClick={() => setIsOpen(false)}
                className="group flex w-full items-center justify-between gap-3 px-3 py-2.5 text-xs sm:text-sm font-medium text-foreground hover:bg-primary/10 hover:text-primary rounded-xl transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                role="menuitem"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                    <User size={16} />
                  </div>
                  <span>تسجيل الدُّخول</span>
                </div>
              </a>
            )}

            {/* PWA Install Button */}
            {canInstall && !isInstalled && (
              <div className="pt-1 mt-1 border-t border-border/50">
                <button
                  type="button"
                  onClick={async () => {
                    setIsOpen(false);
                    await promptInstall();
                  }}
                  className="group flex w-full items-center justify-between gap-3 px-3 py-2.5 text-xs sm:text-sm font-medium text-foreground hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-xl transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                  role="menuitem"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                      <Download size={16} />
                    </div>
                    <span>تثبيت التَّطبيق</span>
                  </div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    يُنصَح بتثبيته
                  </span>
                </button>
              </div>
            )}
          </div>,
          document.body
        )}

      {/* Confirmation Dialog preserved */}
      <ConfirmDialog
        open={isLogoutDialogOpen}
        title="تسجيل الخروج"
        message="هل أنت متأكِّد أنَّك تريد تسجيل الخروج؟"
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
