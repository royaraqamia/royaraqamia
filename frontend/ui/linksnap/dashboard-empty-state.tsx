import { Link2 } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { HeroCtaButton, HeroCtaSheen } from '@/frontend/ui/shared/hero-cta-button';

export function DashboardEmptyState() {
  return (
    <EmptyState
      icon={Link2}
      variant="card"
      title="لم تقم بإنشاء أي روابط مختصَرة بعد."
      description="قم باختصار رابطك الأوَّل لبدء تتبع النقرات!"
      action={
        <HeroCtaButton asChild>
          <Link href="/linksnap">
            <HeroCtaSheen />
            <span className="relative z-10">إنشاء أول رابط</span>
          </Link>
        </HeroCtaButton>
      }
    />
  );
}
