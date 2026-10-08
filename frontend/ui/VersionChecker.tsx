'use client';

import { useAppVersion } from '@/frontend/state/use-app-version';

export function VersionChecker() {
  useAppVersion();
  return null;
}
