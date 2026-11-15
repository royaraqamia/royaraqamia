import type { ScreenScope } from '@/frontend/state/screen-scopes';
import type { RateBasis } from '@/shared/contracts/rates';

/**
 * What `/rates` registers while the converter is on screen (ADR-0181, #1420).
 *
 * The basis is the chip the member chose: the parallel market and the official
 * rate are the same pair and the same path, and "which rate did you use?" is the
 * question the screen already answers on its result card. The amounts and the
 * two currencies are the member's own figures and the surface has no allowlist
 * for them, so nothing else travels.
 */
export function ratesScreenScope(basis: RateBasis): ScreenScope {
  return { id: 'rates.page', kind: 'screen', tab: basis };
}
