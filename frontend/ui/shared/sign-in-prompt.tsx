'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/ui/primitives/dialog';
import { useSession } from '@/frontend/state/session-provider';

export function SignInPrompt({
  children,
  title = 'تسجيل الدُّخول مطلوب',
  description = 'هذه الميزة تحتاج إلى حساب. سجِّل الدُّخول لحفظ بياناتك ومزامنتها على كلِّ أجهزتك.',
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const { user, isLoading } = useSession();
  const pathname = usePathname();

  if (user || isLoading) return <>{children}</>;

  const loginHref = `/auth/login?redirect=${encodeURIComponent(pathname || '/')}`;

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-3xl border border-border/80 bg-card p-6 shadow-2xl">
        <DialogHeader className="space-y-2 text-start">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Lock className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle className="text-lg font-bold tracking-tight">{title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button asChild className="w-full">
            <Link href={loginHref}>تسجيل الدُّخول</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
