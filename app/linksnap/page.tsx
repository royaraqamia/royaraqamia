import { Hero } from '@/frontend/ui/linksnap-landing/Hero';
import { FeaturesBento } from '@/frontend/ui/linksnap-landing/FeaturesBento';
import { HowItWorks } from '@/frontend/ui/linksnap-landing/HowItWorks';
import { BottomCTA } from '@/frontend/ui/linksnap-landing/BottomCTA';
import { RedirectErrorNotice } from '@/frontend/ui/linksnap-landing/RedirectErrorNotice';

export default function LinkSnapLandingPage() {
  return (
    <>
      <RedirectErrorNotice />
      <Hero />
      <FeaturesBento />
      <HowItWorks />
      <BottomCTA />
    </>
  );
}
