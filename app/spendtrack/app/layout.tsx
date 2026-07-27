import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/Navbar';

export default async function SpendTrackAppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/spendtrack');

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24">
        <div className="container-padding mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
