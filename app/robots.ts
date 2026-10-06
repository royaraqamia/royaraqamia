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
  '/offline',
  '/linksnap/app',
  '/habitflow/app',
  '/spendtrack/app',
  '/blogpress/app',
  '/blogpress/editor',
];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getCanonicalOrigin();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: DISALLOWED_PATHS,
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
