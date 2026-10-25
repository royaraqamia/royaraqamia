import { CheckCircle2 } from 'lucide-react';

import { testimonials } from '../../data/testimonials';

// Deterministic pastel/vibrant gradient generator based on user name
const AVATAR_GRADIENTS = [
  'from-violet-600 via-indigo-600 to-purple-500',
  'from-fuchsia-600 via-purple-600 to-pink-500',
  'from-cyan-600 via-blue-600 to-indigo-500',
  'from-emerald-600 via-teal-600 to-cyan-500',
  'from-amber-600 via-orange-600 to-rose-500',
  'from-rose-600 via-pink-600 to-purple-500',
];

function getInitials(name: string): string {
  if (!name) return 'ع';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2);
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`;
}

function getGradientByName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index] ?? 'from-violet-600 via-indigo-600 to-purple-500';
}

export interface TestimonialMeta {
  gradient: string;
  initials: string;
}

// Precomputed once at module load — no per-render hash/string work for every card
const TESTIMONIAL_META = new Map<string, TestimonialMeta>(
  testimonials.map((t) => [
    t.name,
    { gradient: getGradientByName(t.name), initials: getInitials(t.name) },
  ])
);

export function getTestimonialMeta(name: string): TestimonialMeta {
  return (
    TESTIMONIAL_META.get(name) ?? {
      gradient: 'from-violet-600 via-indigo-600 to-purple-500',
      initials: 'ع',
    }
  );
}

// Micro-Component: Verified Customer Badge
export function VerifiedBadge({ label = 'مُوثَّق' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 shadow-xs">
      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
      <span>{label}</span>
    </span>
  );
}
