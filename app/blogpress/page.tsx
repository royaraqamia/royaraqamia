'use client';

import { Hero } from '@/components/blogpress-landing/Hero';
import { FeaturesBento } from '@/components/blogpress-landing/FeaturesBento';
import { HowItWorks } from '@/components/blogpress-landing/HowItWorks';
import { BottomCTA } from '@/components/blogpress-landing/BottomCTA';

export default function BlogPressLandingPage() {
  return (
    <>
      <Hero />
      <FeaturesBento />
      <HowItWorks />
      <BottomCTA />
    </>
  );
}
