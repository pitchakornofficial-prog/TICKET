import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://static.cloudflareinsights.com`,
      "object-src 'none'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-src 'self' https://maps.google.com https://www.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const privateNoStoreHeaders = [
  {
    key: 'Cache-Control',
    value: 'private, no-store, no-cache, must-revalidate',
  },
];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'standalone',
  serverExternalPackages: ['@resvg/resvg-js'],
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  experimental: {
    agentUpgrade: 'security',
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      ...[
        '/api/events/:path*',
        '/api/events',
        '/orders/lookup',
        '/api/auth/:path*',
        '/api/owner/:path*',
        '/api/organizer/:path*',
        '/api/scanner/:path*',
        '/api/public/checkout/:path*',
        '/api/public/orders/:path*',
      ].map(source => ({ source, headers: privateNoStoreHeaders })),
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

