import { MetadataRoute } from 'next';
import { getCanonicalOrigin } from '@/frontend/shared/constants';
import { loadPublishedPostSitemapEntries } from '@/backend/loaders/community';

// The sitemap reads published posts from the DB, so it is ISR rather than
// build-static. This keeps newly scheduled/auto-published posts flowing in even
// when they bypass the blogpress controller's revalidation hint.
//
// 300s (not 60s): the published filter admits `scheduled AND publish_at <= now`
// rows without any write, so time is the only signal for those — but crawlers
// re-fetch this URL constantly and every regeneration is an ISR write plus
// render CPU. Publishing revalidates `/sitemap.xml` explicitly, so only the
// scheduled-publish path depends on this window.
export const revalidate = 300;

interface SitemapEntryConfig {
  path: string;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
}

const SITEMAP_ENTRIES: SitemapEntryConfig[] = [
  {
    path: '/',
    changeFrequency: 'weekly',
    priority: 1,
  },
  {
    path: '/community',
    changeFrequency: 'daily',
    priority: 0.9,
  },
  {
    path: '/training/apply',
    changeFrequency: 'weekly',
    priority: 0.8,
  },
  {
    path: '/consultation/book',
    changeFrequency: 'weekly',
    priority: 0.8,
  },
  {
    path: '/hire',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/request-project',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/rates',
    changeFrequency: 'daily',
    priority: 0.8,
  },
  {
    path: '/scan',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    // The index only. The 114 sura pages are reachable from it and are not
    // listed individually, the way a feed's pages are not either.
    path: '/quran',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/verify',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    // Public FAQ copy that lives under `/account`, which `robots.ts` otherwise
    // disallows — this entry is the only way a crawler reaches it.
    path: '/account/faq',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  {
    path: '/app-info',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    path: '/privacy',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    path: '/terms',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    path: '/security',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
];

function generateStaticEntry(
  config: SitemapEntryConfig,
  baseUrl: string
): MetadataRoute.Sitemap[number] {
  return {
    url: `${baseUrl}${config.path}`,
    changeFrequency: config.changeFrequency,
    priority: config.priority,
  };
}

async function generatePostEntries(baseUrl: string): Promise<MetadataRoute.Sitemap> {
  try {
    const posts = await loadPublishedPostSitemapEntries();

    return posts.map((post) => ({
      url: `${baseUrl}/community/${post.slug}`,
      // A stable, per-post date. Search engines ignore `lastModified` when it
      // changes on every request, so never stamp these with `new Date()`.
      lastModified: post.updated_at ?? undefined,
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
  } catch {
    // Enumerating posts must never take the whole sitemap down; the static
    // marketing routes still ship if the posts read fails.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getCanonicalOrigin();

  const staticEntries = SITEMAP_ENTRIES.map((config) => generateStaticEntry(config, baseUrl));
  const postEntries = await generatePostEntries(baseUrl);

  return [...staticEntries, ...postEntries];
}
