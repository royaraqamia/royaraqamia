'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, LogOut, Moon, Sun, Menu, X, LayoutDashboard } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/components/linksnap/theme-provider';
import { ConfirmDialog } from '@/components/linksnap/confirm-dialog';
import { useIsMobile } from '@/domains/linksnap/hooks/use-mobile';
import { useSession } from '@/components/shared/session-provider';
import { logout } from '@/lib/actions/auth';
import { Loader2 } from 'lucide-react';

export function Navbar() {
  const { user, isLoading } = useSession();
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const isMobile = useIsMobile();

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const isLoginPage = pathname === '/auth/login';

  const handleSignOut = () => {
    setSigningOut(true);
    toast.success('تم تسجيل الخروج بنجاح');
    logout();
  };

  const userEmail = user?.email ?? null;
  const userAvatar = user?.user_metadata?.avatar_url ?? null;
  const userName = user?.user_metadata?.full_name ?? null;

  const userSection = user ? (
    <Link
      href="/linksnap"
      className="hidden sm:flex items-center gap-2 bg-muted dark:bg-card px-2.5 py-1 rounded-full hover:bg-muted dark:hover:bg-card transition-colors"
      aria-label="الذهاب إلى لوحة التحكم"
    >
      {userAvatar ? (
        <Image
          src={userAvatar}
          alt=""
          width={20}
          height={20}
          className="rounded-full"
          unoptimized
        />
      ) : (
        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
          {(userName || userEmail || '?')[0].toUpperCase()}
        </div>
      )}
      <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">
        {userName || userEmail}
      </span>
    </Link>
  ) : null;

  const navLinks = user ? (
    <>
      <Link
        href="/linksnap"
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground dark:text-muted-foreground hover:text-primary dark:hover:text-primary rounded-lg hover:bg-muted dark:hover:bg-card transition-colors"
      >
        <LayoutDashboard aria-hidden="true" className="w-4 h-4" />
        <span>لوحة التحكم</span>
      </Link>
      <button
        onClick={() => {
          setMobileMenuOpen(false);
          setShowSignOutConfirm(true);
        }}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors w-full text-right"
      >
        <LogOut aria-hidden="true" className="w-4 h-4" />
        <span>تسجيل الخروج</span>
      </button>
    </>
  ) : !isLoginPage ? (
    <Link
      href="/auth/login?redirect=/linksnap"
      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 dark:hover:bg-primary/30 rounded-lg transition-colors"
    >
      <span>تسجيل الدخول</span>
    </Link>
  ) : null;

  return (
    <header className="flex items-center justify-between py-4 border-b border-border/80 dark:border-border mb-10">
      <Link href="/linksnap" className="flex items-center gap-2.5">
        <Image src="/logo.png" alt="LinkSnap" width={40} height={40} className="rounded-xl" />
        <span className="font-display font-extrabold text-xl tracking-tight text-foreground dark:text-foreground">
          Link <span className="text-primary">Snap</span>
        </span>
      </Link>

      <nav className="flex items-center gap-4">
        {mounted && (
          <button
            onClick={toggleTheme}
            className="p-2 text-muted-foreground hover:text-primary rounded-lg hover:bg-muted dark:hover:bg-card transition-colors cursor-pointer press-scale focus-ring"
            aria-label={theme === 'dark' ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
          >
            {theme === 'dark' ? (
              <Sun aria-hidden="true" className="w-4 h-4" />
            ) : (
              <Moon aria-hidden="true" className="w-4 h-4" />
            )}
          </button>
        )}

        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-primary" role="status" />
        ) : user ? (
          <div className="flex items-center gap-3">
            {userSection}

            {isMobile ? (
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 text-muted-foreground hover:text-primary rounded-lg hover:bg-muted dark:hover:bg-card transition-colors cursor-pointer press-scale focus-ring"
                aria-label="فتح القائمة"
              >
                <Menu aria-hidden="true" className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={() => setShowSignOutConfirm(true)}
                className="text-xs font-semibold text-muted-foreground hover:text-red-600 flex items-center gap-1.5 transition-colors cursor-pointer press-opacity focus-ring rounded-lg"
              >
                <LogOut aria-hidden="true" className="w-3.5 h-3.5" />
                <span>تسجيل الخروج</span>
              </button>
            )}
          </div>
        ) : !isLoginPage ? (
          <Link
            href="/auth/login?redirect=/linksnap"
            className="text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer press-scale text-primary hover:text-primary bg-primary/10 dark:bg-primary/30 hover:bg-primary/20 dark:hover:bg-primary/50"
          >
            تسجيل الدُّخول
          </Link>
        ) : (
          <Link
            href="/linksnap"
            className="text-xs font-semibold flex items-center gap-1.5 px-4 py-2 rounded-xl transition-all cursor-pointer press-scale text-primary hover:text-primary bg-primary/10 dark:bg-primary/30 hover:bg-primary/20 dark:hover:bg-primary/50"
          >
            <ArrowLeft aria-hidden="true" className="w-3.5 h-3.5" />
            <span>الرئيسية</span>
          </Link>
        )}
      </nav>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
        {mobileMenuOpen && (
          <motion.div
            key="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            className="fixed top-0 right-0 h-full w-72 bg-white dark:bg-card shadow-2xl z-50 p-6 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="font-display font-bold text-lg text-foreground dark:text-foreground">
                القائمة
              </span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-muted-foreground hover:text-muted-foreground rounded-lg hover:bg-muted dark:hover:bg-card transition-colors cursor-pointer focus-ring"
                aria-label="إغلاق القائمة"
              >
                <X aria-hidden="true" className="w-5 h-5" />
              </button>
            </div>

            {user && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 dark:bg-background/50 rounded-xl mb-2">
                {userAvatar ? (
                  <Image
                    src={userAvatar}
                    alt=""
                    width={36}
                    height={36}
                    className="rounded-full"
                    unoptimized
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                    {(userName || userEmail || '?')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-foreground dark:text-foreground">
                    {userName || userEmail}
                  </span>
                  {userName && <span className="text-xs text-muted-foreground">{userEmail}</span>}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">{navLinks}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={showSignOutConfirm}
        title="تسجيل الخروج"
        message="هل أنت متأكد أنك تريد تسجيل الخروج؟ سيتم إنهاء جلستك الحالية."
        confirmLabel={signingOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'}
        cancelLabel="إلغاء"
        onConfirm={handleSignOut}
        onCancel={() => {
          setShowSignOutConfirm(false);
          setSigningOut(false);
        }}
      />
    </header>
  );
}
