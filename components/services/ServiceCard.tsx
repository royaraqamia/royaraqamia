'use client';

import type { ElementType } from 'react';
import { Check, ArrowRight } from '@phosphor-icons/react';
import { ScrollAnimation } from '../ScrollAnimations';
import { colorConfigs, type ColorKey } from './colorConfigs';

interface ServicePricing {
  cta: string;
  monthly?: string;
  yearly?: string;
  training?: string;
  consultation?: string;
  free?: string;
  employer?: string;
  small?: string;
  large?: string;
  oneTime?: string;
  basic?: string;
  webapp?: string;
  mobile?: string;
}

interface Service {
  icon: ElementType;
  title: string;
  description: string;
  features: string[];
  pricing: ServicePricing;
  colorKey: ColorKey;
  shadowColor: string;
  hoverShadow: string;
  href: string;
}

export function ServiceCard({ service, index }: { service: Service; index: number }) {
  const Icon = service.icon;
  const colors = colorConfigs[service.colorKey];

  return (
    <ScrollAnimation key={index} animation="slide-up" delay={index * 0.1} duration={0.8}>
      <div className="group/card relative rounded-4xl p-8 lg:p-10 h-full flex flex-col transition-all duration-800 ease-[cubic-bezier(0.25,1,0.5,1)] overflow-hidden bg-white/2 border border-white/5 backdrop-blur-sm hover:border-white/15 hover:-translate-y-2 hover:shadow-2xl hover:shadow-black/50">
        {/* Premium Ambient Glow (Replaces the harsh top border & skew shine) */}
        <div className="absolute inset-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-800 ease-[cubic-bezier(0.25,1,0.5,1)] pointer-events-none -z-10">
          <div
            className="absolute top-0 left-0 right-0 h-32 opacity-20 blur-[50px] transition-all duration-800"
            style={{ background: colors.gradient }}
          />
        </div>

        {/* Minimalist Glass Icon Container */}
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-8 transition-all duration-800 ease-[cubic-bezier(0.25,1,0.5,1)] bg-white/5 border border-white/10 group-hover/card:scale-110 group-hover/card:-rotate-3 relative overflow-hidden shrink-0">
          <div
            className="absolute inset-0 opacity-0 group-hover/card:opacity-20 transition-opacity duration-500"
            style={{ background: colors.gradient }}
          />
          <Icon weight="light" className="w-7 h-7 text-white relative z-10 drop-shadow-sm" />
        </div>

        {/* Typography: Crisp, massive, and readable */}
        <h3 className="text-2xl lg:text-3xl font-bold text-white tracking-tight mb-3 transition-transform duration-800 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover/card:translate-x-1 rtl:group-hover/card:-translate-x-1">
          {service.title}
        </h3>

        <p className="text-sm md:text-base text-white/50 leading-relaxed mb-8 group-hover/card:text-white/70 transition-colors duration-500 font-medium">
          {service.description}
        </p>

        {/* Features List: Freed from the internal box */}
        <div className="grow flex flex-col">
          <ul className="space-y-4 mb-10">
            {service.features.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-4 group/item">
                <div className="mt-1 w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-white/5 border border-white/10 transition-colors duration-500 group-hover/item:border-white/30 group-hover/card:bg-white/10">
                  <Check
                    weight="bold"
                    className="w-3 h-3 text-white/40 group-hover/item:text-white transition-colors duration-300"
                  />
                </div>
                <span className="text-sm md:text-base text-white/70 font-medium leading-relaxed group-hover/item:text-white transition-colors duration-300">
                  {feature}
                </span>
              </li>
            ))}
          </ul>

          {/* Premium CTA Button: Glass to Solid transition */}
          {service.pricing && (
            <div className="mt-auto pt-6 border-t border-white/5">
              <a
                href={service.href}
                className="group/cta relative w-full flex items-center justify-center gap-3 px-6 py-4 rounded-full font-bold text-sm md:text-base text-white overflow-hidden transition-all duration-600 ease-[cubic-bezier(0.25,1,0.5,1)] border border-white/10 bg-white/5 hover:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                {/* Background injection on hover */}
                <div
                  className="absolute inset-0 opacity-0 group-hover/cta:opacity-100 transition-opacity duration-600 ease-[cubic-bezier(0.25,1,0.5,1)] -z-10"
                  style={{ background: colors.gradient }}
                />

                <span className="relative z-10 transition-transform duration-500 group-hover/cta:-translate-x-1 rtl:group-hover/cta:translate-x-1">
                  {service.pricing.cta}
                </span>

                <ArrowRight
                  weight="bold"
                  className="w-4 h-4 relative z-10 opacity-50 group-hover/cta:opacity-100 transition-all duration-500 group-hover/cta:translate-x-1 rtl:rotate-180 rtl:group-hover/cta:-translate-x-1"
                />
              </a>
            </div>
          )}
        </div>
      </div>
    </ScrollAnimation>
  );
}
