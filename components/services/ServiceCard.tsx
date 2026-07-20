import type { ElementType } from 'react';
import { Check } from '@phosphor-icons/react';
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
    <ScrollAnimation key={index} animation="slide-up" delay={index * 0.1} duration={0.6}>
      <div
        className="group relative glass-card rounded-3xl card-padding glass-hover transition-all duration-500 hover:-translate-y-2 hover:shadow-xl h-full flex flex-col border border-transparent hover:border-white/10 overflow-hidden"
        style={{ ['--accent-color' as string]: colors.accentBorder }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-1 opacity-80 group-hover:opacity-100 transition-opacity duration-300"
          style={{ background: colors.gradient }}
        />

        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none overflow-hidden rounded-2xl">
          <div
            className="absolute -inset-full top-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent transform -skew-x-12 group-hover:animate-shine"
            style={{ animationDuration: '1.5s' }}
          />
        </div>

        <div
          className="w-16 h-16 md:w-18 md:h-18 rounded-xl flex items-center justify-center content-spacing shadow-lg group-hover:shadow-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-500"
          style={{ background: colors.gradient }}
        >
          <Icon className="w-7 h-7 md:w-8 md:h-8 text-white drop-shadow-md" />
        </div>

        <h3
          className="content-spacing-sm text-h4 font-bold transition-all duration-300 group-hover:bg-clip-text group-hover:text-transparent"
          style={{
            fontFamily: "'IBM Plex Sans Arabic', sans-serif",
            backgroundImage: colors.hoverGradient,
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
          }}
        >
          <span className="group-hover:opacity-0 transition-opacity duration-300 absolute">
            {service.title}
          </span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {service.title}
          </span>
        </h3>
        <p className="text-sm md:text-base text-foreground/70 content-spacing group-hover:text-foreground/80 transition-colors duration-300">
          {service.description}
        </p>

        <div className="flex-grow">
          <div
            className="rounded-xl p-4 border border-border/30 group-hover:border-white/10 transition-colors duration-300"
            style={{
              background:
                'linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.01) 100%)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <ul className="space-y-5">
              {service.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-4 group/item">
                  <div
                    className={`
                      relative flex items-center justify-center flex-shrink-0 mt-1
                      w-6 h-6 rounded-full
                      shadow-lg ${service.shadowColor}
                      transition-all duration-300
                      group-hover/item:scale-110 group-hover/item:shadow-xl ${service.hoverShadow}
                    `}
                    style={{ background: colors.gradient }}
                  >
                    <Check className="w-4 h-4 text-white drop-shadow-lg" strokeWidth={2.5} />
                    <div className="absolute inset-0 rounded-full bg-white/20 blur-md opacity-0 group-hover/item:opacity-100 transition-opacity duration-300" />
                  </div>
                  <span className="text-sm md:text-base text-foreground/90 font-medium leading-6 md:leading-7 group-hover/item:text-foreground transition-colors duration-300">
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {service.pricing && (
          <div className="mt-4">
            <div
              className="rounded-xl p-4 border-2 transition-all duration-300 group-hover:border-white/20"
              style={{
                background: `linear-gradient(135deg, ${colors.glowColor}, transparent)`,
                borderColor: colors.accentBorder + '40',
              }}
            >
              <a
                href={service.href}
                className="mt-1 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm text-white transition-all duration-300 hover:scale-105 hover:shadow-lg group/cta cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-[44px]"
                style={{ background: colors.gradient }}
              >
                <span>{service.pricing.cta}</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </ScrollAnimation>
  );
}
