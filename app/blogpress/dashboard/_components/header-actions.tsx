'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ThemeToggle } from '@/components/blogpress/theme-toggle';
import { logout } from '@/lib/actions/auth';
import { LogOut, FileText, Loader2 } from 'lucide-react';

export function HeaderActions() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  function handleLogout() {
    setPending(true);
    logout();
  }

  return (
    <div className="flex items-center gap-1.5">
      <ThemeToggle />
      <Link href="/blogpress/blog">
        <Button variant="ghost" size="sm" className="transition-smooth">
          <FileText className="ml-2 size-4" />
          المدونة
        </Button>
      </Link>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="transition-smooth text-muted-foreground hover:text-destructive"
          >
            <LogOut className="ml-2 size-4" />
            تسجيل الخروج
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تسجيل الخروج</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من تسجيل الخروج؟ ستحتاج إلى إدخال بيانات تسجيل الدخول مرة أخرى للوصول إلى
              لوحة التحكم.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <DialogTrigger asChild>
              <Button variant="outline" disabled={pending} className="transition-smooth">
                إلغاء
              </Button>
            </DialogTrigger>
            <Button
              variant="destructive"
              onClick={handleLogout}
              disabled={pending}
              className="transition-smooth"
            >
              {pending ? (
                <>
                  <Loader2 className="ml-2 size-4 animate-spin" />
                  جارٍ الخروج...
                </>
              ) : (
                <>
                  <LogOut className="ml-2 size-4" />
                  تسجيل الخروج
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
