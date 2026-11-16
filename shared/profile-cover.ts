import tokens from './tokens/tokens.json';

/**
 * The seeded look of a member's profile cover (ADR-0201).
 *
 * The cover is drawn from the member, not uploaded by them: a palette, an orb
 * placement and an angle, all decided by integer arithmetic over the row's `id`.
 * That is the whole feature — no column, no bucket, no moderation — so the one
 * thing this module must not do is decide anything differently on the other
 * client. The arithmetic is small enough to state here and again in Kotlin, and
 * `COVER_FIXTURES` is what stops the two from drifting: the app's unit test
 * asserts the same list, so a change to either implementation fails in the other.
 *
 * The seed is the id and never the handle. A member who renames themselves must
 * not be repainted, and the id is the only value that survives a rename.
 */
export const COVER_PALETTE_COUNT = tokens.cover.palettes.length;

/** The orb placements an index can take. Four is enough to read as varied at a glance. */
export const COVER_SHAPE_COUNT = 4;

export interface CoverLook {
  /** Which of the twelve palettes, 0-based. */
  palette: number;
  /** Which orb placement, 0-based. */
  shape: number;
}

/**
 * The sum of a string's code points.
 *
 * Code points, not UTF-16 units: a handle may be Arabic and an emoji is two
 * units, so a sum over `charCodeAt` would answer a different number in Kotlin
 * (`codePointAt`) than here. The id is an ASCII uuid today, which makes the
 * distinction free and the rule worth keeping.
 */
export function coverSeed(id: string): number {
  let sum = 0;
  for (const character of id) {
    sum += character.codePointAt(0) ?? 0;
  }
  return sum;
}

/** The look a member's id asks for. Stable for the life of the row. */
export function coverLook(id: string): CoverLook {
  const seed = coverSeed(id);
  return {
    palette: seed % COVER_PALETTE_COUNT,
    shape: Math.floor(seed / COVER_PALETTE_COUNT) % COVER_SHAPE_COUNT,
  };
}

/**
 * Where the two orbs sit, one entry per shape. Logical `x` positions, because
 * the band is read right-to-left and the same shape must not mirror.
 */
const COVER_PLACEMENTS = [
  { x: '18%', y: '0%' },
  { x: '82%', y: '6%' },
  { x: '40%', y: '-6%' },
  { x: '70%', y: '-2%' },
] as const;

/**
 * The look as the custom properties the band's gradients read.
 *
 * The values stay in `shared/tokens/tokens.json` and reach the browser as
 * `--cover-<n>-a` / `--cover-<n>-b`; this only points at the pair the seed
 * chose, so a palette cannot exist in the component and not in the tokens.
 */
export function coverVars(id: string): Record<string, string> {
  const { palette, shape } = coverLook(id);
  const placement = COVER_PLACEMENTS[shape as 0 | 1 | 2 | 3] ?? COVER_PLACEMENTS[0];
  return {
    '--cover-a': `var(--cover-${palette}-a)`,
    '--cover-b': `var(--cover-${palette}-b)`,
    '--cover-x': placement.x,
    '--cover-y': placement.y,
  };
}

/**
 * One id per palette and shape, asserted on both clients.
 *
 * These are the fixtures the Kotlin test mirrors (`ProfileCoverPalettesTest`).
 * They are not sample data for a story: changing one without changing the other
 * is exactly the drift this list exists to catch.
 */
export const COVER_FIXTURES: ReadonlyArray<{ id: string; palette: number; shape: number }> = [
  { id: 'a1b2c3d4-1111-4aaa-9bbb-000000000001', palette: 11, shape: 2 },
  { id: 'b2c3d4e5-2222-4bbb-8ccc-000000000002', palette: 5, shape: 0 },
  { id: 'c3d4e5f6-3333-4ccc-9ddd-000000000003', palette: 1, shape: 2 },
  { id: 'd4e5f6a7-4444-4ddd-8eee-000000000004', palette: 1, shape: 3 },
  { id: '00000000-0000-4000-8000-000000000000', palette: 0, shape: 0 },
];
