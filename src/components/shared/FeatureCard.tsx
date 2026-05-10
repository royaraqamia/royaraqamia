import React from 'react';
import { type Icon as IconComponent } from '@phosphor-icons/react';

interface FeatureCardProps {
  icon: IconComponent;
  title: string;
  description: string;
  className?: string;
  iconClassName?: string;
}

/**
 * Shared Feature Card Component
 * Used across Features sections for consistency
 */
export const FeatureCard: React.FC<FeatureCardProps> = ({
  icon: Icon,
  title,
  description,
  className = '',
  iconClassName = '',
}) => {
  return (
    <div
      className={`glass-card rounded-2xl card-padding glass-hover transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10 h-full flex flex-col ${className}`}
    >
      <div
        className={`w-14 h-14 md:w-16 md:h-16 rounded-xl flex items-center justify-center content-spacing shadow-lg group-hover:shadow-xl group-hover:shadow-primary/20 transition-all duration-300 gradient-primary ${iconClassName}`}
      >
        <Icon className="w-6 h-6 text-white" />
      </div>
      <h3 className="content-spacing-sm text-h4 font-bold">{title}</h3>
      <p className="text-sm md:text-base text-foreground/70">{description}</p>
    </div>
  );
};
