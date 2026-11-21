import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '../support/auth-fixture';
import {
  ensureTicketMasterTemplateSchema,
  parseTicketMasterTemplate,
  readTicketMasterTemplate,
  writeTicketMasterTemplate,
} from '../../src/server/ticket-master-template';
import { DEFAULT_STATE } from '../../src/lib/ticket-master-template-sync';

describe('shared ticket master template database storage', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  beforeAll(async () => {
    fixture = await authFixture('integration');
  }, 30000);
  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  it('stores and reads ticket master template, and handles updates', async () => {
    await ensureTicketMasterTemplateSchema(fixture.pool);

    // Initial state or null
    const initial = await readTicketMasterTemplate(fixture.pool);
    expect(initial === null || typeof initial === 'object').toBe(true);

    // Write custom master template
    const customTemplate = {
      ...DEFAULT_STATE,
      presetId: 'custom-fest-2026',
      bgColor: '#1e293b',
    };

    await writeTicketMasterTemplate(fixture.pool, customTemplate);
    const readBack = await readTicketMasterTemplate(fixture.pool);

    expect(readBack).not.toBeNull();
    expect(readBack?.presetId).toBe('custom-fest-2026');
    expect(readBack?.bgColor).toBe('#1e293b');

    // Update with another preset
    const updatedTemplate = {
      ...customTemplate,
      presetId: 'vip-gold-master',
      bgColor: '#fef3c7',
    };

    await writeTicketMasterTemplate(fixture.pool, updatedTemplate);
    const readUpdated = await readTicketMasterTemplate(fixture.pool);

    expect(readUpdated?.presetId).toBe('vip-gold-master');
    expect(readUpdated?.bgColor).toBe('#fef3c7');
  });

  it('verifies parseTicketMasterTemplate validates input', () => {
    expect(parseTicketMasterTemplate(null)).toBeNull();
    expect(parseTicketMasterTemplate({})).toBeNull();
    expect(parseTicketMasterTemplate({ presetId: 123 })).toBeNull();
  });
});
