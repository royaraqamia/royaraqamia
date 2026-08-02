import { requireAuth } from '@/backend/middleware/auth-guard';
import { Navbar } from '@/frontend/ui/Navbar';

export default async function BlogPressAppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth('/auth/login?redirect=/blogpress');

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24 mx-auto w-full max-w-6xl container-padding pb-8">
        {children}
      </main>
    </div>
  );
}
