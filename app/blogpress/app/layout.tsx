import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function BlogPressAppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/blogpress');

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <main className="flex-1 pt-24 mx-auto w-full max-w-6xl container-padding pb-8">
        {children}
      </main>
    </div>
  );
}
