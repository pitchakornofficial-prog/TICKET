export const DEFAULT_SITE_ORIGIN = 'http://127.0.0.1:3000';

/**
 * Resolve the canonical site origin for metadata, sitemaps, and structured data.
 */
export function getSiteOrigin(rawOrigin = process.env.BETTER_AUTH_URL): string {
  const candidate = rawOrigin?.trim();
  if (!candidate) {
    return DEFAULT_SITE_ORIGIN;
  }
  try {
    return new URL(candidate).origin;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

/**
 * Build a concise single-line meta description from article body text.
 */
export function summarizeNewsDescription(content: string, maxLength = 160): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'ติดตามข่าวสารและความเคลื่อนไหวคอนเสิร์ตจาก TICKET';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

export interface NewsArticleJsonLdInput {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  authorName: string;
  coverUrl?: string | null;
  siteOrigin?: string;
}

/**
 * Build schema.org NewsArticle structured data for a public news article.
 */
export function buildNewsArticleJsonLd(input: NewsArticleJsonLdInput) {
  const origin = input.siteOrigin ?? getSiteOrigin();
  const articleUrl = `${origin}/news/${encodeURIComponent(input.id)}`;
  const resolvedImage = input.coverUrl
    ? input.coverUrl.startsWith('http://') || input.coverUrl.startsWith('https://')
      ? input.coverUrl
      : `${origin}${input.coverUrl.startsWith('/') ? '' : '/'}${input.coverUrl}`
    : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: input.title,
    description: input.description,
    datePublished: input.publishedAt,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': articleUrl,
    },
    author: {
      '@type': 'Organization',
      name: input.authorName || 'TICKET',
    },
    publisher: {
      '@type': 'Organization',
      name: 'TICKET',
    },
    ...(resolvedImage ? { image: [resolvedImage] } : {}),
  };
}

/**
 * Serialize structured data safely for inline <script type="application/ld+json">.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
