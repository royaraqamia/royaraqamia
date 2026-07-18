'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { logout } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { LogOut, LayoutDashboard, Tags } from 'lucide-react';
import { useSession } from '@/components/shared/session-provider';

const navItems = [
  { href: '/spendtrack', label: 'لوحة التحكم', icon: LayoutDashboard },
  { href: '/spendtrack/categories', label: 'التصنيفات', icon: Tags },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Button
            key={item.href}
            variant="ghost"
            size="sm"
            asChild
            className={`transition-all duration-200 gap-1.5 ${
              isActive
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            <Link href={item.href}>
              <item.icon className="size-4" />
              {item.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

export default function SpendTrackLayout({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const userInitial = user?.email?.charAt(0).toUpperCase() || '؟';
  const [logoutOpen, setLogoutOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col">
      <header role="banner" className="sticky top-0 z-50 border-b border-border/60 glass">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/spendtrack" className="shrink-0">
              <div className="relative size-7">
                <Image src="/logo.webp" alt="SpendTrack" fill sizes="28px" priority />
              </div>
            </Link>
            <DashboardNav />
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                {userInitial}
              </div>
              <span className="text-sm text-muted-foreground max-w-[140px] truncate">
                {user?.email}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="min-w-[44px] min-h-[44px]"
              aria-label="تسجيل الخروج"
              onClick={() => setLogoutOpen(true)}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تسجيل الخروج</DialogTitle>
            <DialogDescription>هل أنت متأكد من تسجيل الخروج؟</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLogoutOpen(false)}>
              إلغاء
            </Button>
            <form action={logout}>
              <Button type="submit" variant="destructive">
                تسجيل الخروج
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
      <main id="main-content" className="flex-1 p-4 sm:p-6 animate-fade-in">
        {children}
      </main>
    </div>
  );
}
