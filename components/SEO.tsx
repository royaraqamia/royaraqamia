interface SEOProps {
  title: string;
  description: string;
  keywords?: string[];
  type?: 'website' | 'article';
  image?: string;
  url?: string;
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  section?: string;
  canonical?: string;
  geoRegion?: string;
  geoPlacename?: string;
  geoPosition?: string;
  twitterHandle?: string;
  facebookAppId?: string;
}

export function SEO({
  title,
  description,
  keywords = [],
  type = 'website',
  image = 'https://royaraqamia.com/OG%20Image.png',
  url = 'https://royaraqamia.com',
  publishedTime,
  modifiedTime,
  author,
  section,
  canonical,
  geoRegion = 'SY',
  geoPlacename = 'Aleppo, Syria',
  geoPosition = '36.2021;37.1343',
  twitterHandle = '@royaraqamia',
  facebookAppId = '',
}: SEOProps) {
  const canonicalUrl = canonical || url;
}