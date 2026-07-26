'use client';

import { Hero } from '@/components/habitflow-landing/Hero';
import { FeaturesBento } from '@/components/habitflow-landing/FeaturesBento';
import { HowItWorks } from '@/components/habitflow-landing/HowItWorks';
import { BottomCTA } from '@/components/habitflow-landing/BottomCTA';

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
