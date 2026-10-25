'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { colorConfigs, type ColorKey } from './colorConfigs';

export interface ServiceCardModel {
  icon: LucideIcon;
  title: string;
  description: string;
  colorKey: ColorKey;
  href: string;
}

/**
 * One service in the horizontally scrolling services row. The whole card is the
 * link — there is no separate CTA — so pressing anywhere on the surface opens
 * the service's own page.
 */
export function ServiceCard({ service }: { service: ServiceCardModel }) {
  const Icon = service.icon;
  const colors = colorConfigs[service.colorKey];

  return (
    <Link
      href={service.href}
      aria-label={service.title}
      className="group/service relative rounded-4xl p-6 sm:p-8 w-full h-full flex flex-col overflow-hidden bg-neutral-900/70 border border-white/10 transition-[transform,border-color,box-shadow] duration-500 ease-out hover:border-white/20 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 z-10"
    >
      {/* Dynamic Linear/Vercel-style Top Specular Highlight Line */}
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/25 to-transparent opacity-70 group-hover/service:via-white/50 transition-safe duration-500 pointer-events-none" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Minimalist Glass Icon Container */}
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mb-6 sm:mb-8 bg-white/4 border border-white/10 transition-[transform,border-color] duration-500 ease-out group-hover/service:scale-105 group-hover/service:border-white/25 relative overflow-hidden shrink-0 shadow-inner self-center">
          <div
            className="absolute inset-0 opacity-0 group-hover/service:opacity-30 transition-opacity duration-500"
            style={{ background: colors.gradient }}
          />
          <Icon
            className="w-7 h-7 sm:w-8 sm:h-8 text-white relative z-10 transition-transform duration-500 group-hover/service:scale-110"
            aria-hidden="true"
          />
        </div>

        {/* Typography */}
        <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight mb-2.5 text-center transition-transform duration-500">
          {service.title}
        </h3>

        {service.description && (
          <p className="text-sm sm:text-base text-neutral-400 leading-relaxed text-center group-hover/service:text-neutral-300 transition-colors duration-500 font-normal">
            {service.description}
          </p>
        )}
      </div>
    </Link>
  );
}
