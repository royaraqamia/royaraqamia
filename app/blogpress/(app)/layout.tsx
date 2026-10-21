import type { Metadata } from 'next';
import { AppShell } from '@/frontend/ui/app-shell/app-shell';

export const metadata: Metadata = {
  title: {
    default: 'BlogPress',
    template: '%s | BlogPress',
  },
};

/**
 * Left open to guests on purpose (#449, ADR-0073). The dashboard and the
 * calendar guard themselves on the client — the session provider answers
 * network failure as "never a logout" — so the subtree's shells are static
 * documents the service worker can cache. The editor keeps its own server
 * guard (`verifySession`) and its never-cache prefix, because it renders a
 * post's contents.
 */
export default function BlogPressAppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
