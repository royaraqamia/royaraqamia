import { cn } from '@/frontend/shared/cn';

/**
 * The assistant's own mark: a lit orb.
 *
 * The first version drew an orbit ring with a satellite dot, and at 36px it read
 * as a planet — a Saturn, not a brand mark. The ring is gone: one filled sphere,
 * one highlight, sized to fill the tile. It is deliberately the only non-initial
 * avatar in the app, so the assistant is recognisable at list size in a way a
 * letter in a circle never is.
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
        'inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-violet-500 via-fuchsia-500 to-indigo-600 text-white shadow-[0_6px_16px_-8px_rgba(139,92,246,0.9)]',
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
        {/* A crescent, not a sphere: at 36px a filled disc reads as a dot, and the
            ringed version before it read as a planet. */}
        <path d="M12 4a8 8 0 1 0 0 16 10 10 0 0 1 0-16Z" fill="currentColor" />
      </svg>
    </span>
  );
}
