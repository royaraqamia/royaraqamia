'use client';

import { motion } from 'motion/react';

const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface SectionHeadingProps {
  badge?: React.ReactNode;
  as?: 'div' | 'header';
  wrapperClassName: string;
  titleId?: string;
  titleClassName: string;
  titlePrefix: string;
  titleHighlight: string;
  titleHighlightClassName: string;
  subtitle: string;
  subtitleClassName: string;
  initialY?: number;
  viewportMargin?: string;
  duration?: number;
  useEase?: boolean;
}

export function SectionHeading({
  badge,
  as = 'div',
  wrapperClassName,
  titleId,
  titleClassName,
  titlePrefix,
  titleHighlight,
  titleHighlightClassName,
  subtitle,
  subtitleClassName,
  initialY = 20,
  viewportMargin = '-80px',
  duration = 0.6,
  useEase = true,
}: SectionHeadingProps) {
  const Tag = as === 'header' ? motion.header : motion.div;
  return (
    <Tag
      initial={{ opacity: 0, y: initialY }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: viewportMargin }}
      transition={useEase ? { duration, ease } : { duration }}
      className={wrapperClassName}
    >
      {badge}
      <h2 id={titleId} className={titleClassName}>
        {titlePrefix}
        <span className={titleHighlightClassName}>{titleHighlight}</span>
      </h2>
      <p className={subtitleClassName}>{subtitle}</p>
    </Tag>
  );
}
