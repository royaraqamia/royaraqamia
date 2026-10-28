import { z } from 'zod';

/**
 * The Athkar reader's content, as `data/athkar/*.json` stores it.
 *
 * The text is a fixed asset, so it is validated once at build time
 * (`backend/loaders/athkar.ts`) rather than defended against at request time:
 * a malformed entry fails `next build` instead of rendering half a page.
 *
 * `repeat` is the count the narration states for that dhikr, and it is the
 * target the reader counts to. It is not a "suggested" number — the UI clamps at
 * it.
 */
export const ATHKAR_PERIODS = ['morning', 'evening'] as const;
export type AthkarPeriod = (typeof ATHKAR_PERIODS)[number];

export const ATHKAR_PERIOD_LABELS: Record<AthkarPeriod, string> = {
  morning: 'الصَّباح',
  evening: 'المساء',
};

export const AthkarSourceSchema = z.object({
  /** The collection the text is narrated in, e.g. «صحيح البخاري». */
  label: z.string().min(1),
  /** Where in it: a hadith number, or the chapter when the printing's numbers vary. */
  ref: z.string().min(1),
});

export const AthkarItemSchema = z.object({
  /**
   * Stable within a collection, and the key the count is stored under. Lowercase
   * ASCII so a renamed label can never move someone's saved progress.
   */
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  text: z.string().min(1),
  repeat: z.number().int().min(1).max(1000),
  /** The reward or promise the narration states, when it states one. */
  virtue: z.string().min(1).optional(),
  source: AthkarSourceSchema,
});

export const AthkarCollectionSchema = z
  .object({
    period: z.enum(ATHKAR_PERIODS),
    title: z.string().min(1),
    items: z.array(AthkarItemSchema).min(1),
  })
  .superRefine((collection, ctx) => {
    const seen = new Set<string>();
    for (const [index, item] of collection.items.entries()) {
      if (seen.has(item.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'id'],
          message: `duplicate id «${item.id}»`,
        });
      }
      seen.add(item.id);
    }
  });

export interface AthkarSource {
  label: string;
  ref: string;
}

export interface AthkarItem {
  id: string;
  text: string;
  repeat: number;
  virtue?: string;
  source: AthkarSource;
}

export interface AthkarCollection {
  period: AthkarPeriod;
  title: string;
  items: AthkarItem[];
}
