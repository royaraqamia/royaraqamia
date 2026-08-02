import { requireAuth } from '@/backend/middleware/auth-guard';
import { Navbar } from '@/frontend/ui/Navbar';

export default async function HabitFlowAppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth('/auth/login?redirect=/habitflow');

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24">{children}</main>
    </div>
  );
}
