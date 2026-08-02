import { requireAuth } from '@/backend/middleware/auth-guard';
import { Navbar } from '@/frontend/ui/Navbar';

export default async function SpendTrackAppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth('/auth/login?redirect=/spendtrack');

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24">
        <div className="container-padding mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
