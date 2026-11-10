import { MCP_MARKETPLACE_COPY } from '@/frontend/ui/mcp/marketplace-copy';

/**
 * The unified apps surface's words: the three tab names and the search field
 * each tab shows (ADR-0155, ADR-0146).
 *
 * They live here rather than in `shared/copy/` for the same recorded reason the
 * marketplace's words do (`frontend/ui/mcp/marketplace-copy.ts`): a copy source
 * no ported component claims is refused, and the native sheet is ported in the
 * follow-up. That change moves this module to `shared/copy/`, generates the
 * Kotlin object from it, and lists the pair in `docs/mobile/parity.json`.
 *
 * A `{name}` is a placeholder the caller substitutes, not a format string.
 */
export const APPS_SURFACE_COPY = {
  tabsLabel: 'أقسام التطبيقات',
  tabInternal: 'تطبيقاتنا',
  tabExternal: 'تطبيقات خارجيَّة',
  tabInbound: 'الـ MCP الخاص بنا',

  searchLabel: 'البحث في التطبيقات',
  searchInternal: 'ابحث في تطبيقاتنا...',
  searchExternal: MCP_MARKETPLACE_COPY.searchPlaceholder,
  searchInbound: 'ابحث في التطبيقات المتصلة...',

  searchEmptyInternal: 'لا يوجد تطبيق بهذا الاسم.',
  searchEmptyInbound: 'لا يوجد تطبيق متصل بهذا الاسم.',
} as const;

export type AppsSurfaceCopy = typeof APPS_SURFACE_COPY;
