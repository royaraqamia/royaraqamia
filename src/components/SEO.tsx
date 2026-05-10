import { Helmet } from 'react-helmet-async';

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

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      {keywords.length > 0 && <meta name="keywords" content={keywords.join(', ')} />}
      <meta name="author" content={author || 'رؤية رقمية'} />
      <meta
        name="robots"
        content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
      />
      <meta
        name="googlebot"
        content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
      />
      <meta name="bingbot" content="index, follow" />

      {/* Geographic Meta Tags for Local SEO - Arab World */}
      {geoRegion && <meta name="geo.region" content={geoRegion} />}
      {geoPlacename && <meta name="geo.placename" content={geoPlacename} />}
      {geoPosition && <meta name="geo.position" content={geoPosition} />}
      <meta name="ICBM" content={geoPosition} />

      {/* Regional Targeting */}
      <meta name="target" content="ar-SA, ar-AE, ar-EG, ar-JO, ar-KW, ar-QA" />

      {/* Language and Content Tags */}
      <meta name="language" content="Arabic" />
      <meta name="content-language" content="ar" />
      <meta httpEquiv="content-language" content="ar" />
      <meta name="availableLanguage" content="Arabic" />

      {/* Canonical URL and hreflang tags */}
      <link rel="canonical" href={canonicalUrl} />
      {/* Self-referencing hreflang (required for proper localization) */}
      <link rel="alternate" hrefLang="ar" href={canonicalUrl} />
      {/* Regional variants for Arab world */}
      <link rel="alternate" hrefLang="ar-SA" href={canonicalUrl} />
      <link rel="alternate" hrefLang="ar-AE" href={canonicalUrl} />
      <link rel="alternate" hrefLang="ar-EG" href={canonicalUrl} />
      <link rel="alternate" hrefLang="ar-JO" href={canonicalUrl} />
      <link rel="alternate" hrefLang="ar-KW" href={canonicalUrl} />
      <link rel="alternate" hrefLang="ar-QA" href={canonicalUrl} />
      <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />

      {/* Open Graph Tags */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={title} />
      <meta property="og:locale" content="ar_AR" />
      <meta property="og:locale:alternate" content="ar_SA" />
      <meta property="og:locale:alternate" content="ar_AE" />
      <meta property="og:locale:alternate" content="ar_EG" />
      <meta property="og:locale:alternate" content="ar_JO" />
      <meta property="og:locale:alternate" content="ar_KW" />
      <meta property="og:locale:alternate" content="ar_QA" />
      <meta property="og:site_name" content="رؤية رقمية" />
      {facebookAppId && <meta property="fb:app_id" content={facebookAppId} />}

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:site" content={twitterHandle} />
      <meta name="twitter:creator" content={twitterHandle} />

      {/* Article specific tags */}
      {type === 'article' && publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {type === 'article' && modifiedTime && (
        <meta property="article:modified_time" content={modifiedTime} />
      )}
      {type === 'article' && author && <meta property="article:author" content={author} />}
      {type === 'article' && section && <meta property="article:section" content={section} />}

      {/* Additional SEO Meta Tags */}
      <meta name="rating" content="general" />
      <meta name="distribution" content="global" />

      {/* HTML Attributes */}
      <html lang="ar" dir="rtl" />
    </Helmet>
  );
}
