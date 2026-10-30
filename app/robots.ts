import { MetadataRoute } from 'next';
import { getCanonicalOrigin } from '@/frontend/shared/constants';

/**
 * Routes that are either non-content (API), authenticated, or private product
 * surfaces. Auth middleware already gates them, but keeping crawlers out
 * preserves crawl budget and keeps thin/private pages out of the index.
 */
const DISALLOWED_PATHS = [
  '/api/',
  '/admin',
  '/account',
  '/auth/',
  '/mcp',
  '/linksnap',
  '/habitflow',
  '/spendtrack',
  '/blogpress',
];

/**
 * Crawlable exceptions inside a disallowed prefix. `/account/faq` is public
 * marketing copy (the FAQ that used to sit on the home page), so it is the one
 * path under `/account` a crawler may read — longest match wins, and it is
 * listed in `sitemap.ts` so the sitemap is still how it is found.
 */
const ALLOWED_EXCEPTIONS = ['/account/faq'];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getCanonicalOrigin();

  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/mcp/guide', ...ALLOWED_EXCEPTIONS],
      disallow: DISALLOWED_PATHS,
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
