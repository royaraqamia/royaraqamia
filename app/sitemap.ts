import { MetadataRoute } from 'next';
import { getCanonicalOrigin } from '@/frontend/shared/constants';
import {
  loadCommunityMemberHandles,
  loadPublishedPostSitemapEntries,
} from '@/backend/loaders/community';
import { loadSurahNumbers } from '@/backend/loaders/quran';

// The sitemap reads published posts from the DB, so it is ISR rather than
// build-static. This keeps newly published posts flowing in even when they
// bypass the blogpress controller's revalidation hint.
//
// 300s (not 60s): a due scheduled post is promoted by the
// `publish-due-scheduled-posts` pg_cron job (`publish_due_scheduled_posts()`,
// every 5 minutes), and that write happens in Postgres, where nothing can
// revalidate this URL — so time is the only signal for the scheduled path.
// Crawlers re-fetch the sitemap constantly and every regeneration is an ISR
// write plus render CPU, so the window is the floor for both: publishing through
// the app revalidates `/sitemap.xml` explicitly, a promotion waits up to this
// long.
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
    // Regenerated every morning by the digest workflow; the cron time is the
    // only thing that changes the page's date, so `daily` is literal.
    path: '/news',
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
    // Public on purpose: a visitor reaches the plans from `/account` and may
    // compare them without an account (ADR-0075).
    path: '/pricing',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/scan',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/downloader',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    // The MCP setup guide. `/mcp` itself is disallowed in `robots.ts`; this is
    // the one crawlable page under that prefix, and `robots.ts` allows it.
    path: '/mcp/guide',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  {
    // The index and, below, the 114 sura pages themselves.
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

async function generateSurahEntries(baseUrl: string): Promise<MetadataRoute.Sitemap> {
  try {
    const numbers = await loadSurahNumbers();

    return numbers.map((number) => ({
      url: `${baseUrl}/quran/${number}`,
      // The text is vendored and never edited, so a sura page never changes.
      changeFrequency: 'yearly',
      priority: 0.6,
    }));
  } catch {
    return [];
  }
}

async function generateMemberEntries(baseUrl: string): Promise<MetadataRoute.Sitemap> {
  try {
    const handles = await loadCommunityMemberHandles();

    return handles.map((handle) => ({
      // Handles may be Arabic, so the URL is percent-encoded — the same form
      // every internal `/u/` link uses.
      url: `${baseUrl}/u/${encodeURIComponent(handle)}`,
      changeFrequency: 'monthly',
      priority: 0.5,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getCanonicalOrigin();

  const staticEntries = SITEMAP_ENTRIES.map((config) => generateStaticEntry(config, baseUrl));
  const [postEntries, surahEntries, memberEntries] = await Promise.all([
    generatePostEntries(baseUrl),
    generateSurahEntries(baseUrl),
    generateMemberEntries(baseUrl),
  ]);

  return [...staticEntries, ...postEntries, ...surahEntries, ...memberEntries];
}
