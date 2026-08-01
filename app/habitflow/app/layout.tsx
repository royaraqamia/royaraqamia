import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/backend/transport/supabase/server';
import { Navbar } from '@/components/Navbar';

export default async function HabitFlowAppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/habitflow');

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24">{children}</main>
    </div>
  );
}
