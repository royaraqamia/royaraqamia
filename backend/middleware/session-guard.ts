import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { identity } from '@/backend/config/identity';

/**
 * The cached session verifier keeps React's `cache()` so a page render shares
 * one identity resolution; the resolution itself belongs to the identity module.
 */
export const verifySession = cache(async () => {
  const { user } = await identity.resolveSession();

  if (!user) {
    redirect('/auth/login?redirect=/blogpress/app');
  }

  return { isAuth: true, userId: user.id, user };
});
