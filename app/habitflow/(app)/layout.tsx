import { AppShell } from '@/frontend/ui/app-shell/app-shell';
import { MotionRoot } from '@/frontend/ui/MotionRoot';

export default function HabitFlowAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <MotionRoot>{children}</MotionRoot>
    </AppShell>
  );
}
