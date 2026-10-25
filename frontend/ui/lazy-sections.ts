'use client';

import type { ComponentType } from 'react';

export const HOME_SECTION_IDS = ['testimonials', 'verify', 'why-us', 'cta', 'hero-visual'] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

export const HOME_SECTIONS = {
  testimonials: () => import('./Testimonials').then((m) => m.Testimonials),
  verify: () => import('./VerifySection').then((m) => m.VerifySection),
  'why-us': () => import('./WhyUs').then((m) => m.WhyUs),
  cta: () => import('./CTA').then((m) => m.CTA),
  'hero-visual': () => import('./HeroVisual').then((m) => m.HeroVisual),
} as const satisfies Record<HomeSectionId, () => Promise<ComponentType>>;

export function loadHomeSection(id: HomeSectionId) {
  return HOME_SECTIONS[id]();
}
