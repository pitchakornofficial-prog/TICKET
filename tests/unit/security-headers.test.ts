import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

describe('Security headers configuration in next.config.ts', () => {
  it('defines headers function in nextConfig', () => {
    expect(typeof nextConfig.headers).toBe('function');
  });

  it('applies comprehensive security headers to all routes (/:path*)', async () => {
    if (!nextConfig.headers) {
      throw new Error('headers function is not defined on nextConfig');
    }
    const headersConfig = await nextConfig.headers();
    expect(headersConfig).toHaveLength(1);

    const rootRule = headersConfig[0];
    expect(rootRule.source).toBe('/:path*');

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

    // 6. Content Security Policy with frame-ancestors 'none' to block clickjacking
    const csp = headersMap.get('Content-Security-Policy');
    expect(csp).toBeDefined();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("img-src 'self' data: blob: https:");
  });
});
