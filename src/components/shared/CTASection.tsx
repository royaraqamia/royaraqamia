import React from 'react';
import { ArrowLeft, type Icon as IconComponent } from '@phosphor-icons/react';

interface CTASectionProps {
  badge?: {
    text: string;
    icon?: IconComponent;
  };
  title: React.ReactNode;
  description?: string;
  button: {
    text: string;
    href: string;
    external?: boolean;
  };
  className?: string;
}

/**
 * Shared CTA Section Component
 * Used across landing pages for consistency
 */
export const CTASection: React.FC<CTASectionProps> = ({
  badge,
  title,
  description,
  button,
  className = '',
}) => {
  const BadgeIcon = badge?.icon;

  return (
    <section
      className={`section-spacing relative overflow-hidden ${className}`}
      style={{ contentVisibility: 'auto' }}
    >
      <div className="max-w-6xl mx-auto container-padding">
        <div className="text-center max-w-4xl mx-auto">
          {badge && (
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border content-spacing bg-white/10 backdrop-blur-sm border-white/20 shadow-inner">
              {BadgeIcon && <BadgeIcon className="w-4 h-4 text-white" />}
              <span className="text-sm font-medium text-white">{badge.text}</span>
            </div>
          )}

          <h2 className="content-spacing-sm text-4xl md:text-5xl lg:text-7xl font-bold font-heading leading-tight tracking-tight">
            {title}
          </h2>

          {description && (
            <p className="text-xl md:text-2xl text-foreground/80 content-spacing max-w-3xl mx-auto leading-relaxed">
              {description}
            </p>
          )}

          <div className="content-spacing pt-4">
            <a
              href={button.href}
              target={button.external ? '_blank' : undefined}
              rel={button.external ? 'noopener noreferrer' : undefined}
              className="inline-block w-full md:w-auto transform hover:-translate-y-1 transition-transform duration-300"
            >
              <div className="gradient-primary text-white font-bold text-lg md:text-xl px-8 md:px-14 h-14 md:h-16 rounded-full shadow-2xl shadow-primary/40 hover:shadow-[0_20px_60px_rgba(119,102,238,0.6)] relative overflow-hidden cursor-pointer group flex items-center justify-center ring-2 ring-white/10 hover:ring-white/30 transition-all">
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[200%] group-hover:translate-x-[200%] transition-transform duration-1000 ease-in-out"></span>
                <span className="relative flex items-center justify-center gap-3 whitespace-nowrap">
                  {button.text}
                  <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1.5 transition-transform flex-shrink-0" />
                </span>
              </div>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
