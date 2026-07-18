import { MetadataRoute } from 'next';

interface SitemapEntryConfig {
  path: string;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
  hasAlternates?: boolean;
}

const SITEMAP_ENTRIES: SitemapEntryConfig[] = [
  {
    path: '/',
    changeFrequency: 'weekly',
    priority: 1,
    hasAlternates: true,
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
    path: '/blogpress/blog',
    changeFrequency: 'daily',
    priority: 0.9,
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
];

function getBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://royaraqamia.com';

  try {
    const url = new URL(baseUrl);
    return url.origin;
  } catch {
    return 'https://royaraqamia.com';
  }
}

function generateSitemapEntry(
  config: SitemapEntryConfig,
  baseUrl: string,
  currentDate: Date
): MetadataRoute.Sitemap[number] {
  const entry: MetadataRoute.Sitemap[number] = {
    url: `${baseUrl}${config.path}`,
    lastModified: currentDate,
    changeFrequency: config.changeFrequency,
    priority: config.priority,
  };

  if (config.hasAlternates) {
    entry.alternates = {
      languages: {
        ar: `${baseUrl}/`,
        'x-default': `${baseUrl}/`,
      },
    };
  }

  return entry;
}

export default function sitemap(): MetadataRoute.Sitemap {
  try {
    const baseUrl = getBaseUrl();
    const currentDate = new Date();

    return SITEMAP_ENTRIES.map((config) => generateSitemapEntry(config, baseUrl, currentDate));
  } catch {
    return [
      {
        url: 'https://royaraqamia.com',
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 1,
      },
    ];
  }
}
