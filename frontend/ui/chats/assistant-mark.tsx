import { cn } from '@/frontend/shared/cn';

/**
 * The assistant's own mark: an orb with an orbit around it.
 *
 * The list drew the assistant as the first letter of «المساعد الذكي» in the same
 * circle every other chat uses, so the product's one advertised feature looked
 * like a member whose name happened to start with «ا» — and the thread header
 * drew nothing at all.
 *
 * It is an inline SVG rather than an image on purpose: `next/image` refuses an
 * SVG source unless `dangerouslyAllowSVG` is set, and this is a glyph that must
 * take its colour from the surface, not a photograph.
 */
export function AssistantMark({
  className,
  glyphClassName,
}: {
  className?: string;
  /** Sizing for the glyph inside the tile; defaults to a little over half. */
  glyphClassName?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-violet-600 via-fuchsia-500 to-indigo-600 text-white shadow-[0_8px_20px_-10px_rgba(139,92,246,0.9)] ring-1 ring-white/25',
        'size-9',
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={cn('size-[58%]', glyphClassName)}
        aria-hidden="true"
      >
        <ellipse
          cx="12"
          cy="12"
          rx="9.4"
          ry="4.1"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="1.4"
          transform="rotate(-28 12 12)"
        />
        <circle cx="12" cy="12" r="3.3" fill="currentColor" />
        <circle cx="19.4" cy="8.2" r="1.5" fill="currentColor" />
      </svg>
    </span>
  );
}
