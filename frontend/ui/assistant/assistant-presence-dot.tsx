import { cn } from '@/frontend/shared/cn';

/**
 * نور's availability dot, drawn exactly where a member's `PresenceAvatar`
 * draws one (ADR 0212): same emerald, same ring, same corner.
 *
 * The visual dot is hidden from assistive technology — colour alone is not a
 * state — so the caller's sentence carries it instead. نور has no `lastSeenAt`:
 * the dot is steady availability, never an activity signal; a turn's activity
 * is the phase line, which has its own animated dots.
 */
export function AssistantPresenceDot({ label, className }: { label: string; className?: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'absolute bottom-0 end-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background',
          className
        )}
      />
      <span className="sr-only">{label}</span>
    </>
  );
}
