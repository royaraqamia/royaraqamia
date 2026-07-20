import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { GoUpButton } from '@/components/GoUpButton';
import { WhatsAppFloat } from '@/components/WhatsAppFloat';
import { SkipToContent } from '@/components/SkipToContent';

export default async function HabitFlowLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/habitflow');

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SkipToContent />
      <Navbar />
      <main id="main-content" className="flex-1 pt-24">
        {children}
      </main>
      <Footer />
      <GoUpButton />
      <WhatsAppFloat />
    </div>
  );
}
