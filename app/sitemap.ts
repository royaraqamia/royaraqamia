import { MetadataRoute } from 'next';

// ============================================
// Type Definitions
// ============================================

interface SitemapEntryConfig {
  path: string;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
  hasAlternates?: boolean;
}

// ============================================
// Configuration Layer
// ============================================

const SITEMAP_ENTRIES: SitemapEntryConfig[] = [
  {
    path: '/',
    changeFrequency: 'weekly',
    priority: 1,
    hasAlternates: true,
  },
  {
    path: '/#home',
    changeFrequency: 'monthly',
    priority: 0.9,
  },
  {
    path: '/#training',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/#consultations',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/#portfolio',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/#webdev',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/#why-us',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    path: '/#faq',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    path: '/#services',
    changeFrequency: 'monthly',
    priority: 0.9,
  },
  {
    path: '/#cta',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
];

// ============================================
// Helper Functions
// ============================================

/**
 * Validates and retrieves the base URL from environment variables.
 * Throws an error if the URL is invalid or missing.
 */
function getBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://royaraqamia.com';
  
  try {
    const url = new URL(baseUrl);
    return url.origin;
  } catch (error) {
    throw new Error(`Invalid NEXT_PUBLIC_BASE_URL: ${baseUrl}`);
  }
}

/**
 * Generates a single sitemap entry from configuration.
 */
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

// ============================================
// Main Sitemap Function
// ============================================

export default function sitemap(): MetadataRoute.Sitemap {
  try {
    const baseUrl = getBaseUrl();
    const currentDate = new Date();

    return SITEMAP_ENTRIES.map((config) => 
      generateSitemapEntry(config, baseUrl, currentDate)
    );
  } catch (error) {
    console.error('Error generating sitemap:', error);
    // Fallback to minimal sitemap in case of error
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