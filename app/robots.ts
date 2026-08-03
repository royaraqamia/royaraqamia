import { MetadataRoute } from 'next';
import { env } from '@/backend/config/env';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = env.baseUrl;

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
