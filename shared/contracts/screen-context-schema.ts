import { z } from 'zod';

import {
  SCREEN_CONTEXT_FIELD_KEY_CHARS_MAX,
  SCREEN_CONTEXT_FIELD_VALUE_CHARS_MAX,
  SCREEN_CONTEXT_FIELDS_MAX,
  SCREEN_CONTEXT_FOCUS_ID_CHARS_MAX,
  SCREEN_CONTEXT_FOCUS_KIND_CHARS_MAX,
  SCREEN_CONTEXT_OVERLAY_ID_CHARS_MAX,
  SCREEN_CONTEXT_OVERLAY_KIND_CHARS_MAX,
  SCREEN_CONTEXT_OVERLAYS_MAX,
  SCREEN_CONTEXT_PRODUCT_CHARS_MAX,
  SCREEN_CONTEXT_ROUTE_CHARS_MAX,
  SCREEN_CONTEXT_SCREEN_ID_CHARS_MAX,
  SCREEN_CONTEXT_TAB_CHARS_MAX,
  SCREEN_CONTEXT_TEXT_CHARS_MAX,
  SCREEN_CONTEXT_TITLE_CHARS_MAX,
} from './screen-context';

/**
 * The snapshot's wire shape (ADR-0181, decision 1).
 *
 * Separate from the type on purpose: Zod is a parser, and the browser imports
 * the type, the caps and the settle window on every page the assistant opens.
 * The page that publishes a snapshot already knows its own shape; the page that
 * answers one has to check it, and that page is the server.
 *
 * Every bound here is the contract's own number rather than a second one, so a
 * value that passes the type cannot be refused by the schema for a different
 * reason than it was capped for.
 */

/** The snapshot as it arrives on the wire. `.strict()` is not the house style. */
export const ScreenContextSnapshotSchema = z.object({
  route: z.string().trim().min(1).max(SCREEN_CONTEXT_ROUTE_CHARS_MAX),
  product: z.string().trim().max(SCREEN_CONTEXT_PRODUCT_CHARS_MAX),
  screenId: z.string().trim().max(SCREEN_CONTEXT_SCREEN_ID_CHARS_MAX),
  title: z.string().max(SCREEN_CONTEXT_TITLE_CHARS_MAX),
  overlays: z
    .array(
      z.object({
        id: z.string().max(SCREEN_CONTEXT_OVERLAY_ID_CHARS_MAX),
        kind: z.string().max(SCREEN_CONTEXT_OVERLAY_KIND_CHARS_MAX),
      })
    )
    .max(SCREEN_CONTEXT_OVERLAYS_MAX),
  focus: z
    .object({
      kind: z.string().max(SCREEN_CONTEXT_FOCUS_KIND_CHARS_MAX),
      id: z.string().max(SCREEN_CONTEXT_FOCUS_ID_CHARS_MAX),
    })
    .nullable(),
  tab: z.string().max(SCREEN_CONTEXT_TAB_CHARS_MAX).nullable(),
  fields: z
    .record(
      z.string().max(SCREEN_CONTEXT_FIELD_KEY_CHARS_MAX),
      z.string().max(SCREEN_CONTEXT_FIELD_VALUE_CHARS_MAX)
    )
    .refine((fields) => Object.keys(fields).length <= SCREEN_CONTEXT_FIELDS_MAX, {
      message: 'حقول كثيرة في الشاشة الواحدة',
    }),
  text: z.string().max(SCREEN_CONTEXT_TEXT_CHARS_MAX),
  updatedAt: z.string().max(40),
});

export const ScreenContextBlindSchema = z.object({ blind: z.literal(true) });

/**
 * A request's page state. A client with no eyes sends no field at all; a client
 * on a screen it may not show sends `{ blind: true }`.
 */
export const ScreenContextInputSchema = z.union(
  [ScreenContextSnapshotSchema, ScreenContextBlindSchema],
  {
    error: 'تعذّر قراءة حالة الشاشة',
  }
);
