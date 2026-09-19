import { isSafeRedirect } from '@/shared/safe-redirect';

export function authLink(
  path: string,
  redirectTo: string | null | undefined,
  extraParams: Record<string, string> = {}
): string {
  const params = new URLSearchParams();
  if (redirectTo && redirectTo !== '/' && isSafeRedirect(redirectTo)) {
    params.set('redirect', redirectTo);
  }
  for (const [key, value] of Object.entries(extraParams)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
