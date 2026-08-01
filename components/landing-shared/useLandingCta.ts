'use client';

import { useRouter } from 'next/navigation';
import { useSession } from '@/components/shared/session-provider';

export function useLandingCta(appPath: string, loginRedirect: string) {
  const router = useRouter();
  const { user } = useSession();

  const handleCTA = () => {
    if (user) {
      router.push(appPath);
    } else {
      router.push(`/auth/login?redirect=${loginRedirect}`);
    }
  };

  const scrollToFeatures = () => {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToHowItWorks = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
  };

  return { user, handleCTA, scrollToFeatures, scrollToHowItWorks };
}
