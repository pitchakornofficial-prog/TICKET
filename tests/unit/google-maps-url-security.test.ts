import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { parseSafeGoogleMapsUrl, sanitizeGoogleMapsUrl } from '../../src/lib/google-maps-url';
import { createEventDraft, updateEventDraft } from '../../src/server/events';

function createDraftPool(status = 'draft'): Pool {
  const client = {
    query: async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('SELECT "organizerId", status FROM events WHERE id = $1')) {
        return { rows: [{ organizerId: 'org-1', status }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {},
  };

  return {
    query: async () => ({ rows: [], rowCount: 0 }),
    connect: async () => client,
  } as unknown as Pool;
}

describe('Google Maps URL validation & XSS/URI scheme protection', () => {
  it('accepts valid https Google Maps URLs and empty values', () => {
    expect(parseSafeGoogleMapsUrl(undefined)).toBeNull();
    expect(parseSafeGoogleMapsUrl('')).toBeNull();
    expect(parseSafeGoogleMapsUrl('   ')).toBeNull();

    expect(parseSafeGoogleMapsUrl('https://maps.google.com/?q=15.117,104.902')).toBe(
      'https://maps.google.com/?q=15.117,104.902',
    );
    expect(parseSafeGoogleMapsUrl('https://maps.app.goo.gl/abc123')).toBe(
      'https://maps.app.goo.gl/abc123',
    );
    expect(parseSafeGoogleMapsUrl('https://www.google.com/maps/place/Ubon')).toBe(
      'https://www.google.com/maps/place/Ubon',
    );
    expect(parseSafeGoogleMapsUrl('https://goo.gl/maps/xyz')).toBe('https://goo.gl/maps/xyz');
  });

  it('rejects javascript:, data:, http:, and non-Google-Maps hosts', () => {
    const unsafeInputs = [
      'javascript:alert(document.cookie)',
      'JAVASCRIPT:fetch("https://evil.invalid")',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'http://maps.google.com/?q=1,2',
      'https://evil.example.com/maps',
      'https://www.google.com/search?q=not-maps',
      'not a url',
    ];

    for (const input of unsafeInputs) {
      expect(() => parseSafeGoogleMapsUrl(input)).toThrow();
      expect(sanitizeGoogleMapsUrl(input)).toBeNull();
    }
  });

  it('blocks unsafe googleMapsUrl in createEventDraft and updateEventDraft', async () => {
    const pool = createDraftPool('draft');

    await expect(
      createEventDraft(pool, 'org-1', {
        title: 'Test Concert',
        location: 'Main Hall',
        googleMapsUrl: 'javascript:alert(1)',
      }),
    ).rejects.toThrow('โปรโตคอล https://');

    await expect(
      updateEventDraft(pool, 'evt-1', 'org-1', {
        googleMapsUrl: 'https://evil.example.com/phish',
      }),
    ).rejects.toThrow('โดเมนของ Google Maps');
  });
});
