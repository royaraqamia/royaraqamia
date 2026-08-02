'use client';

import { Hero } from '@/frontend/ui/habitflow-landing/Hero';
import { FeaturesBento } from '@/frontend/ui/habitflow-landing/FeaturesBento';
import { HowItWorks } from '@/frontend/ui/habitflow-landing/HowItWorks';
import { BottomCTA } from '@/frontend/ui/habitflow-landing/BottomCTA';

export default function HabitFlowLandingPage() {
  return (
    <>
      <Hero />
      <FeaturesBento />
      <HowItWorks />
      <BottomCTA />
    </>
  );
}
