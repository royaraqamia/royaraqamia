/**
 * The homepage surface's words that only the site draws yet (ADR-0146).
 *
 * The strip, the empty state and the picker are ported, so their words live in
 * `shared/copy` and both clients draw them. What is left here is the selected
 * app's loading and failure faces: the app opens a tab's route in the document,
 * so there is no native surface drawing them yet, and a key with no pair would
 * be copy that only goes stale (ADR-0098).
 */
export const HOME_COPY = {
  surfaceLoading: 'جاري تحميل التطبيق',
  surfaceFailed: 'تعذّر تحميل التطبيق. تحقّق من اتصالك ثم أعد المحاولة.',
  retry: 'أعد المحاولة',
} as const;
