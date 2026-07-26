'use client';

import { Hero } from '@/components/spendtrack-landing/Hero';
import { FeaturesBento } from '@/components/spendtrack-landing/FeaturesBento';
import { HowItWorks } from '@/components/spendtrack-landing/HowItWorks';
import { BottomCTA } from '@/components/spendtrack-landing/BottomCTA';

export default function SpendTrackLandingPage() {
  return (
    <>
      <Hero />
      <FeaturesBento />
      <HowItWorks />
      <BottomCTA />
    </>
  );
}
