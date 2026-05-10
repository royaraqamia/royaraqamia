import React from 'react';

interface SectionHeaderProps {
  title: React.ReactNode;
  subtitle?: string;
  description?: string;
  className?: string;
}

/**
 * Shared Section Header Component
 * Used across Hero, Features, CTA sections for consistency
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  description,
  className = '',
}) => {
  return (
    <div className={`text-center max-w-3xl mx-auto ${className}`}>
      {subtitle && (
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-4">
          {subtitle}
        </div>
      )}
      <h2 className="text-h2 mb-4 font-sans">{title}</h2>
      {description && (
        <p className="text-sm sm:text-base lg:text-lg text-foreground/70">{description}</p>
      )}
    </div>
  );
};
