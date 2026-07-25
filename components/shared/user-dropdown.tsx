'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { User, SignOut, Download } from '@phosphor-icons/react';
import { useSession } from './session-provider';
import { usePWAContext } from '../PWAProvider';
import { ConfirmDialog } from './confirm-dialog';

export function UserDropdown() {
  const { user, isLoading, signOut } = useSession();
  const { canInstall, promptInstall, isInstalled } = usePWAContext();
  const [isOpen, setIsOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside, { passive: true });
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (isLoading) {
    return (
      <div className="p-2">
        <div className="size-[22px] rounded-full bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative p-2 rounded-full hover:bg-muted transition-colors',
          isOpen && 'bg-muted'
        )}
        aria-label="قائمة المستخدم"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <User size={22} className="text-foreground" />
      </button>

      {isOpen && (
        <div
          className="absolute top-full mt-2 w-52 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 sm:inset-s-0 max-sm:fixed max-sm:top-16 max-sm:inset-s-4 max-sm:w-[calc(100vw-2rem)]"
          role="menu"
          aria-label="قائمة المستخدم"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
            }
          }}
        >
          {user ? (
            <button
              onClick={() => {
                setIsOpen(false);
                setIsLogoutDialogOpen(true);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors text-right rounded-full"
              role="menuitem"
            >
              <SignOut size={18} />
              تسجيل الخروج
            </button>
          ) : (
            <a
              href="/auth/login"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors text-right"
              role="menuitem"
            >
              <User size={18} />
              تسجيل الدُّخول
            </a>
          )}

          {canInstall && !isInstalled && (
            <button
              onClick={async () => {
                setIsOpen(false);
                await promptInstall();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors text-right border-t border-border"
              role="menuitem"
            >
              <Download size={18} />
              تثبيت التَّطبيق
            </button>
          )}
        </div>
      )}

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
