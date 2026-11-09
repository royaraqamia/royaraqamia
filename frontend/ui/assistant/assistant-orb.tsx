import { cn } from '@/frontend/shared/cn';

/**
 * نور's mark, at the size the floating door and its panel draw it (ADR-0143).
 *
 * The thread already has `AssistantMark` — a crescent on a gradient tile, the
 * only non-initial avatar in the app. This is that same sphere as a lit object
 * rather than a tile: a warm core inside a violet-to-fuchsia orbit, with one
 * slow halo. It is deliberately the same crescent, so the assistant a member
 * meets in the corner is recognisably the one in their chat list.
 *
 * The gradient lives in `app/global.css` (`.assistant-orb`) because a conic
 * gradient, the inner shadow that makes it a sphere, and the halo's orbit are
 * not utilities; the classes here only size it.
 */
export function AssistantOrb({
  className,
  glyphClassName,
}: {
  className?: string;
  /** Sizing for the crescent inside the sphere; defaults to a little under half. */
  glyphClassName?: string;
}) {
  return (
    <span aria-hidden="true" className={cn('assistant-orb size-11', className)}>
      <span className="assistant-orb-halo" />
      <svg viewBox="0 0 24 24" fill="none" className={cn('size-[46%] text-white', glyphClassName)}>
        {/* The crescent, not a disc: at 56px a filled circle reads as a dot. */}
        <path d="M12 4a8 8 0 1 0 0 16 10 10 0 0 1 0-16Z" fill="currentColor" />
      </svg>
    </span>
  );
}
