import { coverVars } from '@/shared/profile-cover';

/**
 * The band a member's identity is drawn on (ADR-0200).
 *
 * It is scenery, not content: drawn from the member's id, carrying no text, no
 * image and no meaning that is only in colour, so it is `aria-hidden` and the
 * name, handle and counts sit on the card below it. The avatar's top half
 * overlaps this band, which is what makes the header read as a profile rather
 * than as a decorated card.
 */
export function ProfileCover({ memberId }: { memberId: string }) {
  return (
    <div
      data-visual="profile-cover"
      aria-hidden="true"
      style={coverVars(memberId)}
      className="relative h-[132px] overflow-hidden border-b border-border/35 [box-shadow:inset_0_-24px_30px_-22px_rgba(0,0,0,0.75)] sm:h-[160px]"
    >
      <span className="cover-wash-a pointer-events-none absolute inset-0" />
      <span className="cover-wash-b pointer-events-none absolute inset-0" />
      <span className="cover-sweep pointer-events-none absolute inset-0" />
      <span className="cover-vignette pointer-events-none absolute inset-0" />
    </div>
  );
}
