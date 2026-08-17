'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import { useSession } from '@/frontend/state/session-provider';

interface LandingCtaProps {
  appPath: string;
  loginRedirect: string;
  scrollTarget: 'features' | 'how-it-works';
  primaryClassName: string;
  primarySpanClassName?: string;
  loggedOutLabel: string;
  loggedInLabel: string;
  arrowClassName: string;
  secondaryClassName: string;
  secondaryLabel: string;
}

export function LandingCta({
  appPath,
  loginRedirect,
  scrollTarget,
  primaryClassName,
  primarySpanClassName,
  loggedOutLabel,
  loggedInLabel,
  arrowClassName,
  secondaryClassName,
  secondaryLabel,
}: LandingCtaProps) {
  const router = useRouter();
  const { user } = useSession();

  const handlePrimary = () => {
    router.push(user ? appPath : `/auth/login?redirect=${loginRedirect}`);
  };

  const handleSecondary = () => {
    document.getElementById(scrollTarget)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <Button size="xl" onClick={handlePrimary} className={primaryClassName}>
        <span className={primarySpanClassName}>{user ? loggedInLabel : loggedOutLabel}</span>
        <ArrowLeft size={20} className={arrowClassName} />
      </Button>
      <Button size="xl" variant="outline" onClick={handleSecondary} className={secondaryClassName}>
        {secondaryLabel}
      </Button>
    </>
  );
}
