import { redirect } from 'next/navigation';
import { requireAdminAuth } from '@/backend/middleware/admin-auth-guard';
import { Navbar } from '@/frontend/ui/Navbar';

// The single guard for the whole Admin Console. Sections below only worry about
// their own width, header and navigation — never about authentication.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdminAuth();
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      redirect('/');
    }
    redirect('/auth/login?redirect=/admin');
  }

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <Navbar />
      <main id="main-content" className="flex-1 pt-20 lg:pt-24">
        {children}
      </main>
    </div>
  );
}
