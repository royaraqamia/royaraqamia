'use client';

import { ElementType, MouseEvent } from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'motion/react';
import { Check, ArrowRight, Code, Lightbulb, MessageCircle } from 'lucide-react';
import { colorConfigs, type ColorKey } from './colorConfigs';

// Lucide components cannot cross the RSC boundary, so the server sends a
// serializable key and the icon is resolved here in the client bundle.
const serviceIcons = {
  code: Code,
  chat: MessageCircle,
  bulb: Lightbulb,
} as const;
export type ServiceIconKey = keyof typeof serviceIcons;
const iconMap: Record<ServiceIconKey, ElementType> = serviceIcons;

// Types remain the same for perfect drop-in compatibility
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
  icon: ServiceIconKey;
  title: string;
  description: string;
  features: string[];
  pricing: ServicePricing;
  colorKey: ColorKey;
  shadowColor: string;
  hoverShadow: string;
  href: string;
}

// Framer Motion Entrance Variant
const cardVariant = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  show: (index: number) =>
    ({
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 80,
        damping: 20,
        delay: index * 0.1,
      },
    }) as const,
} as const;

export function ServiceCard({ service, index }: { service: Service; index: number }) {
  const Icon = iconMap[service.icon]!;
  const colors = colorConfigs[service.colorKey];

  // Elite Detail: Mouse Tracking Spotlight
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent<HTMLDivElement>) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <motion.article
      custom={index}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-50px' }}
      variants={cardVariant}
      onMouseMove={handleMouseMove}
      className="group/service relative rounded-4xl p-6 sm:p-8 lg:p-9 h-full flex flex-col overflow-hidden bg-neutral-900/70 border border-white/10 transition-all duration-500 ease-out hover:border-white/20 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-black/60 z-10"
      style={{
        boxShadow: `0 0 0 0 ${service.shadowColor}`, // Fallback
      }}
    >
      {/* Dynamic Linear/Vercel-style Top Specular Highlight Line */}
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/25 to-transparent opacity-70 group-hover/service:via-white/50 transition-all duration-500 pointer-events-none" />

      {/* 
        The Magic: Mouse-tracking spotlight background. 
        It injects the specific service color gradient bound to cursor position. 
      */}
      <motion.div
        className="absolute -inset-px z-0 opacity-0 group-hover/service:opacity-100 transition-opacity duration-500 pointer-events-none mix-blend-screen rounded-4xl"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              650px circle at ${mouseX}px ${mouseY}px,
              ${colors.gradient}25, 
              transparent 80%
            )
          `,
        }}
      />

      {/* Static ambient background glow */}
      <div
        className="absolute -top-12 -left-12 w-64 h-64 opacity-0 group-hover/service:opacity-20 glow-blur-md transition-opacity duration-700 -z-10 pointer-events-none rounded-full"
        style={{ background: colors.gradient }}
      />

      <div className="relative z-10 flex flex-col h-full">
        {/* Minimalist Glass Icon Container */}
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mb-6 sm:mb-8 bg-white/4 border border-white/10 transition-all duration-500 ease-out group-hover/service:scale-105 group-hover/service:border-white/25 relative overflow-hidden shrink-0 shadow-inner">
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
        <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight mb-2.5 transition-transform duration-500 group-hover/service:translate-x-1 rtl:group-hover/service:-translate-x-1">
          {service.title}
        </h3>

        <p className="text-sm sm:text-base text-neutral-400 leading-relaxed mb-6 sm:mb-8 group-hover/service:text-neutral-300 transition-colors duration-500 font-normal">
          {service.description}
        </p>

        {/* Features List */}
        <div className="grow flex flex-col">
          <ul className="space-y-3.5 sm:space-y-4 mb-8 sm:mb-10 grow" role="list">
            {service.features.map((feature, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3.5 group/item p-1.5 -mx-1.5 rounded-full hover:bg-white/3 transition-colors duration-200"
              >
                <div className="mt-0.5 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center shrink-0 bg-white/5 border border-white/10 transition-all duration-300 group-hover/item:border-white/30 group-hover/item:scale-110 relative overflow-hidden">
                  <Check
                    className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-neutral-400 transition-colors duration-300 group-hover/item:text-white"
                    aria-hidden="true"
                  />
                  {/* Hidden gradient text applied to checkmark via hover effect */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover/item:opacity-100 transition-opacity duration-300 flex items-center justify-center"
                    style={{
                      color:
                        colors.gradient
                          .split(',')[0]
                          ?.replace('linear-gradient(to right, ', '')
                          .trim() ?? '#fff',
                    }}
                  >
                    <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                  </div>
                </div>
                <span className="text-xs sm:text-sm md:text-base text-neutral-300 font-medium leading-relaxed group-hover/item:text-white transition-colors duration-200">
                  {feature}
                </span>
              </li>
            ))}
          </ul>

          {/* Premium CTA Button */}
          {service.pricing && (
            <div className="mt-auto pt-6 border-t border-white/10 relative">
              <a
                href={service.href}
                className="group/cta relative w-full flex items-center justify-center gap-2.5 px-6 py-3.5 sm:py-4 rounded-full font-semibold text-sm sm:text-base text-white overflow-hidden transition-all duration-300 border border-white/15 bg-neutral-800/60 hover:bg-neutral-800/90 hover:border-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 active:scale-[0.98] shadow-md shadow-black/30"
                aria-label={`${service.pricing.cta} - ${service.title}`}
              >
                {/* Background gradient injection */}
                <div
                  className="absolute inset-0 opacity-0 group-hover/cta:opacity-100 transition-opacity duration-500 -z-10"
                  style={{ background: colors.gradient }}
                />

                <span className="relative z-10 transition-transform duration-300 group-hover/cta:-translate-x-0.5 rtl:group-hover/cta:translate-x-0.5">
                  {service.pricing.cta}
                </span>

                <div className="relative z-10 overflow-hidden w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">
                  <ArrowRight
                    className="absolute w-4 h-4 sm:w-5 sm:h-5 opacity-70 group-hover/cta:opacity-100 transition-all duration-300 -translate-x-full group-hover/cta:translate-x-0 rtl:rotate-180 rtl:translate-x-full rtl:group-hover/cta:translate-x-0"
                    aria-hidden="true"
                  />
                  <ArrowRight
                    className="absolute w-4 h-4 sm:w-5 sm:h-5 opacity-70 group-hover/cta:opacity-0 transition-all duration-300 translate-x-0 group-hover/cta:translate-x-full rtl:rotate-180 rtl:translate-x-0 rtl:group-hover/cta:-translate-x-full"
                    aria-hidden="true"
                  />
                </div>
              </a>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}
