'use client';

import { useTransition } from 'react';
import { logout } from '@/frontend/api/auth';

export function useLogout() {
  const [isLoggingOut, startLogoutTransition] = useTransition();

  const signOut = () => startLogoutTransition(() => logout());

  return { signOut, isLoggingOut };
}
