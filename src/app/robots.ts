import type { MetadataRoute } from 'next';
import { getSiteOrigin } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin/',
        '/organizer/',
        '/back-office/',
        '/scanner/',
        '/orders/',
        '/login',
        '/my-tickets',
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
