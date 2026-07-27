'use client';

import { ElementType, MouseEvent } from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'motion/react';
import { Check, ArrowRight } from '@phosphor-icons/react';
import { colorConfigs, type ColorKey } from './colorConfigs';

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
  const Icon = service.icon;
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
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-50px' }}
      variants={cardVariant}
      onMouseMove={handleMouseMove}
      className="group/card relative rounded-[2.5rem] p-8 lg:p-10 h-full flex flex-col overflow-hidden bg-white/2 border border-white/5 backdrop-blur-md transition-all duration-500 hover:border-white/10 hover:-translate-y-2 hover:shadow-2xl z-10"
      style={{
        boxShadow: `0 0 0 0 ${service.shadowColor}`, // Fallback
      }}
    >
      {/* 
        The Magic: Mouse-tracking spotlight background. 
        It injects the specific service color gradient but bound to the cursor position. 
      */}
      <motion.div
        className="absolute inset-0 z-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-700 pointer-events-none mix-blend-screen"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              600px circle at ${mouseX}px ${mouseY}px,
              ${colors.gradient}25, 
              transparent 80%
            )
          `,
        }}
      />

      {/* Static ambient top glow (retained but softened) */}
      <div
        className="absolute top-0 inset-x-0 h-40 opacity-0 group-hover/card:opacity-20 blur-[60px] transition-opacity duration-1000 -z-10 pointer-events-none"
        style={{ background: colors.gradient }}
      />

      <div className="relative z-10 flex flex-col h-full">
        {/* Minimalist Glass Icon Container */}
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8 bg-white/3 border border-white/10 transition-transform duration-700 ease-out group-hover/card:scale-110 group-hover/card:-rotate-3 relative overflow-hidden shrink-0 shadow-lg">
          <div
            className="absolute inset-0 opacity-0 group-hover/card:opacity-30 transition-opacity duration-500"
            style={{ background: colors.gradient }}
          />
          <Icon weight="duotone" className="w-8 h-8 text-white relative z-10" />
        </div>

        {/* Typography */}
        <h3 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight mb-3 transition-transform duration-500 group-hover/card:translate-x-2 rtl:group-hover/card:-translate-x-2">
          {service.title}
        </h3>

        <p className="text-base text-white/50 leading-relaxed mb-8 group-hover/card:text-white/70 transition-colors duration-500 font-medium">
          {service.description}
        </p>

        {/* Features List */}
        <div className="grow flex flex-col">
          <ul className="space-y-4 mb-10">
            {service.features.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-4 group/item">
                <div className="mt-1 w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-white/5 border border-white/10 transition-all duration-500 group-hover/item:border-white/30 group-hover/item:scale-110">
                  {/* Elite Detail: Checkmark adopts the service's primary color on hover */}
                  <Check
                    weight="bold"
                    className="w-3.5 h-3.5 text-white/30 transition-colors duration-500"
                    style={{ color: 'inherit' }}
                  />
                  {/* Hidden gradient text to apply to checkmark via sibling selector logic in React */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover/item:opacity-100 transition-opacity duration-500 flex items-center justify-center"
                    style={{
                      color:
                        colors.gradient
                          .split(',')[0]
                          ?.replace('linear-gradient(to right, ', '')
                          .trim() ?? '#fff',
                    }}
                  >
                    <Check weight="bold" className="w-3.5 h-3.5" />
                  </div>
                </div>
                <span className="text-sm md:text-base text-white/60 font-medium leading-relaxed group-hover/item:text-white transition-colors duration-300">
                  {feature}
                </span>
              </li>
            ))}
          </ul>

          {/* Premium CTA Button */}
          {service.pricing && (
            <div className="mt-auto pt-8 border-t border-white/10 relative">
              <a
                href={service.href}
                className="group/cta relative w-full flex items-center justify-center gap-3 px-6 py-4 rounded-full font-bold text-base text-white overflow-hidden transition-all duration-500 border border-white/10 bg-white/5 hover:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 hover:shadow-xl shadow-black/20"
              >
                {/* Background gradient injection */}
                <div
                  className="absolute inset-0 opacity-0 group-hover/cta:opacity-100 transition-opacity duration-500 -z-10"
                  style={{ background: colors.gradient }}
                />

                <span className="relative z-10 transition-transform duration-500 group-hover/cta:-translate-x-1 rtl:group-hover/cta:translate-x-1">
                  {service.pricing.cta}
                </span>

                <div className="relative z-10 overflow-hidden w-5 h-5 flex items-center justify-center">
                  <ArrowRight
                    weight="bold"
                    className="absolute w-5 h-5 opacity-50 group-hover/cta:opacity-100 transition-all duration-500 -translate-x-full group-hover/cta:translate-x-0 rtl:rotate-180 rtl:translate-x-full rtl:group-hover/cta:translate-x-0"
                  />
                  <ArrowRight
                    weight="bold"
                    className="absolute w-5 h-5 opacity-50 group-hover/cta:opacity-0 transition-all duration-500 translate-x-0 group-hover/cta:translate-x-full rtl:rotate-180 rtl:translate-x-0 rtl:group-hover/cta:-translate-x-full"
                  />
                </div>
              </a>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
