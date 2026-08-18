'use client';

import type { ComponentType } from 'react';

export const HOME_SECTION_IDS = [
  'portfolio',
  'testimonials',
  'web-dev-service',
  'training-courses',
  'certificate',
  'verify',
  'consultations-cards',
  'why-us',
  'faq',
  'cta',
  'hero-visual',
] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

export const HOME_SECTIONS = {
  portfolio: () => import('./portfolio/portfolio').then((m) => m.Portfolio),
  testimonials: () => import('./Testimonials').then((m) => m.Testimonials),
  'web-dev-service': () => import('./WebDevService').then((m) => m.WebDevService),
  'training-courses': () => import('./TrainingCourses').then((m) => m.TrainingCourses),
  certificate: () => import('./Certificate').then((m) => m.Certificate),
  verify: () => import('./VerifySection').then((m) => m.VerifySection),
  'consultations-cards': () => import('./ConsultationCards').then((m) => m.ConsultationCards),
  'why-us': () => import('./WhyUs').then((m) => m.WhyUs),
  faq: () => import('./FAQ').then((m) => m.FAQ),
  cta: () => import('./CTA').then((m) => m.CTA),
  'hero-visual': () => import('./HeroVisual').then((m) => m.HeroVisual),
} as const satisfies Record<HomeSectionId, () => Promise<ComponentType>>;

export function loadHomeSection(id: HomeSectionId) {
  return HOME_SECTIONS[id]();
}
