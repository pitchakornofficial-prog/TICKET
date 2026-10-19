import { describe, expect, it } from 'vitest';
import { formatBaht, formatDateTime } from '../../src/lib/locale';
import { scriptedProvider } from '../support/scripted-provider';
import { testDatabaseUrl } from '../support/test-database';

describe('Thai display defaults', () => {
  it('displays THB with two satang digits', () => {
    expect(formatBaht(1234.5)).toBe('฿1,234.50');
    expect(formatBaht(0)).toBe('฿0.00');
  });
  it('displays Bangkok time across the UTC date boundary regardless of host timezone', () => {
    expect(formatDateTime(new Date('2026-10-19T18:05:00Z'))).toBe('20 ตุลาคม 2569 เวลา 01:05');
  });
});

describe('test database isolation guard', () => {
  it.each([
    'postgresql://ticket:local@example.com/ticket_test',
    'postgresql://ticket:local@localhost/ticket_dev',
    'postgresql://ticket:local@localhost/ticket_test?host=example.com',
    'https://localhost/ticket_test',
  ])('rejects unsafe test target %s', value => {
    expect(() => testDatabaseUrl(value)).toThrow('Integration tests require');
  });
  it('accepts the separate local test store', () => {
    expect(testDatabaseUrl('postgresql://ticket:local@127.0.0.1:55433/ticket_test')).toContain(':55433/ticket_test');
  });
});

describe.each(['Omise', 'Resend', 'R2'])('%s local scripted double', () => {
  it('records requests without mutating caller data and consumes success/failure outcomes', async () => {
    const provider = scriptedProvider<{ reference: string }, { id: string }>();
    provider.respond({ id: 'test-result' });
    provider.fail(new Error('provider unavailable'));
    const request = { reference: 'local-only' };
    await expect(provider.call(request)).resolves.toEqual({ id: 'test-result' });
    request.reference = 'changed';
    expect(provider.requests).toEqual([{ reference: 'local-only' }]);
    await expect(provider.call(request)).rejects.toThrow('provider unavailable');
    await expect(provider.call(request)).rejects.toThrow('No scripted provider outcome');
    const independent = scriptedProvider<unknown, unknown>();
    expect(independent.requests).toEqual([]);
  });
});
