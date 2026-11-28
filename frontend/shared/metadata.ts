export const SITE_NAME = 'رؤيَة رقَميَّة';

/**
 * The one title template every page shares: `<page> | رؤيَة رقَميَّة`.
 *
 * `app/layout.tsx` hands it to Next as `metadata.title.template`, and a title a
 * page sets in the browser applies the same template instead of spelling the
 * site name again — the door's tab is the one page that cannot get it from the
 * server (ADR-0031, #1932).
 */
export const SITE_TITLE_TEMPLATE = `%s | ${SITE_NAME}`;

/** The template applied to one page name, for a document title set in the browser. */
export function siteTitle(page: string): string {
  return SITE_TITLE_TEMPLATE.replace('%s', page);
}

export const SITE_DESCRIPTION =
  'نُقدِّم حزمةً متكاملة من المنتجات الرَّقميَّة، بالإضافة إلى خدماتنا الاحترافيَّة في بناء وصيانة المشاريع البرمجيَّة، والتَّدريب، والاستشارات التِّقنيَّة.';
