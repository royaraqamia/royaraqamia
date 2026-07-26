'use client';

import { Hero } from '@/components/landing/Hero';
import { FeaturesBento } from '@/components/landing/FeaturesBento';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { BottomCTA } from '@/components/landing/BottomCTA';

export default function LinkSnapLandingPage() {
  return (
    <>
      <Hero />
      <FeaturesBento />
      <HowItWorks />
      <BottomCTA />
    </>
  );
}
