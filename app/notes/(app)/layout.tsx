import { AppShell } from '@/frontend/ui/app-shell/app-shell';

export default function NotesAppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
