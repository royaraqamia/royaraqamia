import { MetadataRoute } from 'next';
import { getCanonicalOrigin } from '@/frontend/shared/constants';
import { loadPublishedPostSitemapEntries } from '@/backend/loaders/community';

// The sitemap reads published posts from the DB, so it is ISR rather than
// build-static. This keeps newly scheduled/auto-published posts flowing in even
// when they bypass the blogpress controller's revalidation hint.
export const revalidate = 60;

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
    path: '/linksnap',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/blogpress',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/habitflow',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/spendtrack',
    changeFrequency: 'monthly',
    priority: 0.8,
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
    path: '/verify',
    changeFrequency: 'monthly',
    priority: 0.6,
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
