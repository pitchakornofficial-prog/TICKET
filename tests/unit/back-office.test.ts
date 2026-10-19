import { describe, expect, it } from 'vitest';
import { canAccessResource, isRole, roleAccess, roleHome, roles, type Actor } from '../../src/lib/back-office-access';
import { validateBootstrapInput } from '../../src/lib/bootstrap-input';
import { authOptions } from '../../src/server/auth-options';
import type { Pool } from 'pg';

describe('server role and object authorization decisions', () => {
  it('fails closed for unknown roles and anonymous access', () => {
    for (const role of ['admin', '', 'OWNER', null, undefined]) expect(isRole(role)).toBe(false);
    expect(roleAccess(null, 'owner')).toBe('unauthenticated');
    expect(canAccessResource(null, { kind: 'proof', organizerId: 'a' })).toBe(false);
  });
  it.each(roles)('keeps %s workspace distinct from the other two roles', role => {
    const actor: Actor = { id: 'a', role, name: 'test' };
    expect(roleHome(role)).toBe(`/back-office/${role}`);
    for (const required of roles) expect(roleAccess(actor, required)).toBe(role === required ? 'allowed' : 'forbidden');
  });
  it('limits organizer to owned event/order/report and keeps proof owner-only', () => {
    const organizer: Actor = { id: 'a', role: 'organizer', name: 'test' };
    for (const kind of ['event', 'order', 'report'] as const) {
      expect(canAccessResource(organizer, { kind, organizerId: 'a' })).toBe(true);
      expect(canAccessResource(organizer, { kind, organizerId: 'b' })).toBe(false);
    }
    expect(canAccessResource(organizer, { kind: 'proof', organizerId: 'a' })).toBe(false);
    expect(canAccessResource({ ...organizer, role: 'owner' }, { kind: 'proof', organizerId: 'b' })).toBe(true);
  });
  it('limits scanner to explicitly assigned event scope, without report/order/proof grants', () => {
    const scanner: Actor = { id: 's', role: 'scanner', name: 'test' };
    expect(canAccessResource(scanner, { kind: 'event', organizerId: 'a', scannerIds: ['s'] })).toBe(true);
    expect(canAccessResource(scanner, { kind: 'event', organizerId: 'a', scannerIds: ['other'] })).toBe(false);
    expect(canAccessResource(scanner, { kind: 'event', organizerId: 's' })).toBe(false);
    for (const kind of ['order', 'report', 'proof'] as const) expect(canAccessResource(scanner, { kind, organizerId: 's', scannerIds: ['s'] })).toBe(false);
  });
});

describe('internal bootstrap validation', () => {
  const valid = { email: ' Owner@Ticket.invalid ', name: ' เจ้าของเว็บ ', password: '  Long password 002  ' };
  it('canonicalizes email/name but preserves password whitespace exactly', () => {
    expect(validateBootstrapInput(valid)).toEqual({ email: 'owner@ticket.invalid', name: 'เจ้าของเว็บ', password: '  Long password 002  ' });
  });
  it.each([null, {}, { ...valid, name: ' ' }, { ...valid, email: 'invalid' }, { ...valid, password: 'x'.repeat(14) }, { ...valid, password: 'x'.repeat(129) }])('rejects invalid input without exposing credentials', input => {
    expect(() => validateBootstrapInput(input)).toThrow();
  });
  it.each([15, 128])('accepts a password at the %i-character boundary', length => {
    const password = 'x'.repeat(length);
    expect(validateBootstrapInput({ ...valid, password }).password).toBe(password);
  });
  it.each([
    { ...valid, name: 'x'.repeat(101) },
    { ...valid, email: `${'x'.repeat(242)}@example.test` },
    { ...valid, email: 'owner @ticket.invalid' },
    { ...valid, password: 123456789012345 },
  ])('rejects oversized or incorrectly typed account fields', input => {
    expect(() => validateBootstrapInput(input)).toThrow();
  });
});

describe('auth deployment configuration', () => {
  const pool = {} as Pool;
  it('rejects short secret and non-local plain HTTP', () => {
    expect(() => authOptions(pool, { baseURL: 'http://example.com', secret: 'x'.repeat(32) })).toThrow('HTTPS origin');
    expect(() => authOptions(pool, { baseURL: 'http://127.0.0.1:3000', secret: 'short' })).toThrow('at least 32');
  });
  it.each([
    'https://user:password@example.test',
    'https://example.test/login',
    'https://example.test/?redirect=external',
    'https://example.test/#fragment',
    'ftp://localhost',
    'http://127.0.0.1.example.test',
  ])('rejects non-origin or insecure auth URL %s', baseURL => {
    expect(() => authOptions(pool, { baseURL, secret: 'x'.repeat(32) })).toThrow('HTTPS origin');
  });
  it.each([
    ['http://localhost:3000', false],
    ['http://127.0.0.1:3000', false],
    ['http://[::1]:3000', false],
    ['https://ticket.example.test', true],
  ] as const)('accepts %s with its matching cookie security', (baseURL, secure) => {
    const options = authOptions(pool, { baseURL, secret: 'x'.repeat(32) });
    expect(options.trustedOrigins).toEqual([baseURL]);
    expect(options.advanced.useSecureCookies).toBe(secure);
    expect(options.emailAndPassword.disableSignUp).toBe(true);
    expect(options.user.additionalFields.role.input).toBe(false);
  });
});
