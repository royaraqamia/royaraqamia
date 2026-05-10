interface Article {
  title: string;
  description: string;
  image: string;
  author: string;
  date: string;
  url?: string;
}

interface Service {
  name: string;
  description: string;
  provider: string;
  areaServed: string;
  category?: string;
  offers?: {
    price: string;
    priceCurrency: string;
  };
}

interface Testimonial {
  author: string;
  text: string;
  rating: number;
  date?: string;
}

interface OrganizationSchema {
  name: string;
  url: string;
  logo: string;
  description: string;
  email: string;
  telephone: string;
  address?: {
    addressCountry: string;
    addressRegion?: string;
  };
}

interface LocalBusinessSchema {
  name: string;
  url: string;
  logo: string;
  description: string;
  email: string;
  telephone: string;
  address: {
    streetAddress?: string;
    addressLocality: string;
    addressRegion: string;
    addressCountry: string;
  };
  geo: {
    latitude: number;
    longitude: number;
  };
  openingHours?: string[];
  priceRange?: string;
}

interface Course {
  name: string;
  description: string;
  provider: string;
  areaServed?: string;
  educationalCredential?: string;
  courseMode?: string;
  inLanguage?: string;
  offers?: {
    price: string;
    priceCurrency: string;
  };
  totalHistory?: string;
  coursePrerequisites?: string;
}

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface WebSiteSchema {
  name: string;
  url: string;
}

export function StructuredData({
  type,
  data,
}: {
  type:
    | 'article'
    | 'service'
    | 'organization'
    | 'testimonials'
    | 'localBusiness'
    | 'course'
    | 'SoftwareApplication'
    | 'faq'
    | 'breadcrumb'
    | 'website'
    | 'EducationalOccupationalProgram';
  data: any;
}) {
  const generateSchema = () => {
    switch (type) {
      case 'article':
        return generateArticleSchema(data as Article);
      case 'service':
        return generateServiceSchema(data as Service);
      case 'organization':
        return generateOrganizationSchema(data as OrganizationSchema);
      case 'localBusiness':
        return generateLocalBusinessSchema(data as LocalBusinessSchema);
      case 'testimonials':
        return generateTestimonialsSchema(data as Testimonial[]);
      case 'course':
        return generateCourseSchema(data as Course);
      case 'SoftwareApplication':
        return generateSoftwareApplicationSchema(data);
      case 'faq':
        return generateFAQSchema(data);
      case 'breadcrumb':
        return generateBreadcrumbSchema(data as BreadcrumbItem[]);
      case 'website':
        return generateWebSiteSchema(data as WebSiteSchema);
      case 'EducationalOccupationalProgram':
        return generateEducationalOccupationalProgramSchema(data);
      default:
        return null;
    }
  };

  const schema = generateSchema();

  if (!schema) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

function generateWebSiteSchema(site: WebSiteSchema) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: site.url,
  };
}

function generateArticleSchema(article: Article) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    image: article.image,
    author: {
      '@type': 'Person',
      name: article.author,
    },
    publisher: {
      '@type': 'Organization',
      name: 'رؤية رقمية',
      logo: {
        '@type': 'ImageObject',
        url: 'https://royaraqamia.com/logo.png',
      },
    },
    datePublished: article.date,
    dateModified: article.date,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': article.url || 'https://royaraqamia.com',
    },
    inLanguage: 'ar',
  };
}

function generateServiceSchema(service: Service) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description,
    provider: {
      '@type': 'Organization',
      name: service.provider,
    },
    areaServed: {
      '@type': 'Country',
      name: service.areaServed,
    },
    serviceCategory: service.category || 'Professional Services',
    offers: service.offers
      ? {
          '@type': 'Offer',
          price: service.offers.price,
          priceCurrency: service.offers.priceCurrency,
        }
      : undefined,
    inLanguage: 'ar',
  };
}

function generateOrganizationSchema(org: OrganizationSchema) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name,
    url: org.url,
    logo: org.logo,
    description: org.description,
    email: org.email,
    telephone: org.telephone,
    address: org.address
      ? {
          '@type': 'PostalAddress',
          addressCountry: org.address.addressCountry,
          addressRegion: org.address.addressRegion,
        }
      : undefined,
    sameAs: [
      'https://twitter.com/royaraqamia',
      'https://linkedin.com/company/royaraqamia',
      'https://facebook.com/royaraqamia',
    ],
  };
}

function generateLocalBusinessSchema(business: LocalBusinessSchema) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: business.name,
    url: business.url,
    logo: business.logo,
    description: business.description,
    email: business.email,
    telephone: business.telephone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: business.address.streetAddress,
      addressLocality: business.address.addressLocality,
      addressRegion: business.address.addressRegion,
      addressCountry: business.address.addressCountry,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: business.geo.latitude,
      longitude: business.geo.longitude,
    },
    openingHours: business.openingHours || [],
    priceRange: business.priceRange || '$$',
    inLanguage: 'ar',
    areaServed: {
      '@type': 'Country',
      name: 'Syria',
    },
  };
}

function generateTestimonialsSchema(testimonials: Testimonial[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'رؤية رقمية',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: (
        testimonials.reduce((sum, t) => sum + t.rating, 0) / testimonials.length
      ).toFixed(1),
      reviewCount: testimonials.length,
      bestRating: 5,
      worstRating: 1,
    },
    review: testimonials.map((testimonial) => ({
      '@type': 'Review',
      author: {
        '@type': 'Person',
        name: testimonial.author,
      },
      reviewRating: {
        '@type': 'Rating',
        ratingValue: testimonial.rating,
        bestRating: 5,
        worstRating: 1,
      },
      reviewBody: testimonial.text,
      datePublished: testimonial.date,
    })),
  };
}

function generateCourseSchema(course: Course) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.name,
    description: course.description,
    provider: {
      '@type': 'Organization',
      name: course.provider,
      sameAs: 'https://royaraqamia.com',
    },
    areaServed: course.areaServed || 'العالم العربي',
    educationalCredential: course.educationalCredential || 'شهادة إتمام',
    courseMode: course.courseMode || 'Online',
    inLanguage: course.inLanguage || 'ar',
    offers: course.offers
      ? {
          '@type': 'Offer',
          price: course.offers.price,
          priceCurrency: course.offers.priceCurrency,
        }
      : undefined,
    totalHistory: course.totalHistory || undefined,
    coursePrerequisites: course.coursePrerequisites || undefined,
  };
}

function generateSoftwareApplicationSchema(app: any) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: app.name,
    applicationCategory: app.applicationCategory,
    operatingSystem: app.operatingSystem,
    offers: app.offers
      ? {
          '@type': 'Offer',
          price: app.offers.price,
          priceCurrency: app.offers.priceCurrency,
        }
      : undefined,
    description: app.description,
    provider: app.provider,
    aggregateRating: app.aggregateRating,
    featureList: app.featureList,
    inLanguage: app.inLanguage || 'ar',
    url: app.url,
  };
}

function generateFAQSchema(faqs: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

function generateBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function generateEducationalOccupationalProgramSchema(data: any) {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOccupationalProgram',
    name: data.name,
    description: data.description,
    provider: {
      '@type': 'Organization',
      name: data.provider,
      sameAs: 'https://royaraqamia.com',
    },
    educationalCredential: data.educationalCredential || 'شهادة إتمام',
    courseMode: data.courseMode || 'Online',
    inLanguage: data.inLanguage || 'ar',
    areaServed: 'العالم العربي',
  };
}
