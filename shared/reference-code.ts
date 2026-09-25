/**
 * Mints the short, uppercase, human-readable identifier each product calls a
 * Reference Code, a Booking Reference or a Certificate Code. The alphabet, the
 * length, the year segment and the uniqueness retry are owned here; a product
 * supplies only its prefix and its collision policy.
 */

/** Excludes the characters that are easy to misread aloud: I, O, 0 and 1. */
export const REFERENCE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REFERENCE_CODE_LENGTH = 8;

/** `(maxExclusive) => integer in [0, maxExclusive)` — `crypto.randomInt` fits. */
export type RandomIndex = (maxExclusive: number) => number;

/** `TRN-2026-A7K2M9QX` — uppercase only, so it survives being read aloud. */
export function mintReferenceCode(
  prefix: string,
  random: RandomIndex,
  now: Date = new Date()
): string {
  let suffix = '';
  for (let i = 0; i < REFERENCE_CODE_LENGTH; i++) {
    suffix += REFERENCE_CODE_ALPHABET[random(REFERENCE_CODE_ALPHABET.length)] ?? '';
  }
  return `${prefix}-${now.getFullYear()}-${suffix}`;
}

export interface MintWithUniqueCodeOptions<T> {
  /** Total mints attempted before `onExhausted` is raised — the product's collision budget. */
  attempts: number;
  mint: () => string;
  /** Persists the code. Reject to signal a collision, or any other failure. */
  attempt: (code: string) => Promise<T>;
  /** True when the failure means "this code is taken" and a fresh one is warranted. */
  isCollision: (error: unknown) => boolean;
  /** Builds the product's own error for a spent collision budget. */
  onExhausted: (lastError: unknown) => Error;
}

export interface MintedValue<T> {
  code: string;
  result: T;
}

/**
 * Mints until a code is accepted, then hands back both the winning code and the
 * attempt's result. A collision on the UNIQUE column is vanishingly rare but not
 * impossible, so the product's attempts budget bounds the retry.
 */
export async function mintWithUniqueCode<T>(
  options: MintWithUniqueCodeOptions<T>
): Promise<MintedValue<T>> {
  let lastError: unknown;
  for (let minted = 0; minted < options.attempts; minted++) {
    const code = options.mint();
    try {
      return { code, result: await options.attempt(code) };
    } catch (error) {
      if (!options.isCollision(error)) throw error;
      lastError = error;
    }
  }
  throw options.onExhausted(lastError);
}
