import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

describe('Security headers configuration in next.config.ts', () => {
  it('defines headers function in nextConfig', () => {
    expect(typeof nextConfig.headers).toBe('function');
  });

  it('applies comprehensive security headers and private no-store rules to sensitive API paths', async () => {
    if (!nextConfig.headers) {
      throw new Error('headers function is not defined on nextConfig');
    }
    const headersConfig = await nextConfig.headers();
    const rootRule = headersConfig.find(rule => rule.source === '/:path*');
    expect(rootRule).toBeDefined();
    if (!rootRule) throw new Error('Global security header rule is missing');

    const headersMap = new Map(rootRule.headers.map((h) => [h.key, h.value]));

    // 1. Clickjacking protection
    expect(headersMap.get('X-Frame-Options')).toBe('DENY');

    // 2. MIME-type sniffing protection
    expect(headersMap.get('X-Content-Type-Options')).toBe('nosniff');

    // 3. Referrer policy
    expect(headersMap.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');

    // 4. Strict Transport Security (HSTS)
    expect(headersMap.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );

    // 5. Permissions-Policy allowing camera for QR ticket scanner while denying others
    const permissionsPolicy = headersMap.get('Permissions-Policy');
    expect(permissionsPolicy).toBeDefined();
    expect(permissionsPolicy).toContain('camera=(self)');
    expect(permissionsPolicy).toContain('microphone=()');
    expect(permissionsPolicy).not.toContain('browsing-topics');

    // 6. Content Security Policy with frame-ancestors 'none' to block clickjacking
    const csp = headersMap.get('Content-Security-Policy');
    expect(csp).toBeDefined();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com");
    expect(csp).toContain("img-src 'self' data: blob: https:");

    const noStoreRules = headersConfig.filter(rule => rule.headers.some(header => header.key === 'Cache-Control'));
    expect(noStoreRules.map(rule => rule.source)).toEqual([
      '/api/auth/:path*',
      '/api/owner/:path*',
      '/api/organizer/:path*',
      '/api/scanner/:path*',
      '/api/public/checkout/:path*',
      '/api/public/orders/:path*',
    ]);
    for (const rule of noStoreRules) {
      expect(rule.headers.find(header => header.key === 'Cache-Control')?.value)
        .toBe('private, no-store, no-cache, must-revalidate');
    }
  });
});
