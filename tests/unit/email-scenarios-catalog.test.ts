import { describe, expect, it } from 'vitest';
import {
  EMAIL_SCENARIO_CATEGORIES,
  EMAIL_SCENARIOS,
  type EmailScenarioKey,
  getDefaultScenarioPresets,
  getScenarioDefinition,
  getScenariosByCategory,
  interpolateEmailVariables,
  parseEmailMasterPayload,
} from '@/lib/email-template';

describe('Email Scenario Selector & Catalog (13 Scenarios across 4 Categories)', () => {
  it('defines exactly 4 categories with valid metadata', () => {
    expect(EMAIL_SCENARIO_CATEGORIES).toHaveLength(4);
    const categoryIds = EMAIL_SCENARIO_CATEGORIES.map((c) => c.id);
    expect(categoryIds).toEqual(['customer', 'finance', 'staff', 'support']);

    for (const cat of EMAIL_SCENARIO_CATEGORIES) {
      expect(cat.name).toBeTruthy();
      expect(cat.description).toBeTruthy();
    }
  });

  it('defines all 13 scenarios mapped to their respective categories', () => {
    const allKeys = Object.keys(EMAIL_SCENARIOS) as EmailScenarioKey[];
    expect(allKeys).toHaveLength(13);

    const customerScenarios = getScenariosByCategory('customer');
    expect(customerScenarios.map((s) => s.id)).toEqual([
      'ticket_delivery',
      'checkout_otp',
      'lookup_otp',
      'event_reminder',
    ]);

    const financeScenarios = getScenariosByCategory('finance');
    expect(financeScenarios.map((s) => s.id)).toEqual([
      'refund_approved',
      'refund_rejected',
      'ticket_revoked',
      'event_rescheduled',
    ]);

    const staffScenarios = getScenariosByCategory('staff');
    expect(staffScenarios.map((s) => s.id)).toEqual([
      'direct_ticket',
      'organizer_payout',
      'staff_invitation',
      'password_reset',
    ]);

    const supportScenarios = getScenariosByCategory('support');
    expect(supportScenarios.map((s) => s.id)).toEqual(['support_reply']);
  });

  it('enforces Rule D-14 zero emojis across all scenario definitions and default templates', () => {
    // Emoji regex checking common emoji unicode ranges
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]/u;

    for (const [_key, scenario] of Object.entries(EMAIL_SCENARIOS)) {
      expect(scenario.name).not.toMatch(emojiRegex);
      expect(scenario.shortLabel).not.toMatch(emojiRegex);
      expect(scenario.description).not.toMatch(emojiRegex);

      for (const mt of scenario.mergeTags) {
        expect(mt.tag).not.toMatch(emojiRegex);
        expect(mt.label).not.toMatch(emojiRegex);
      }

      const t = scenario.defaultTemplate;
      expect(t.subject).not.toMatch(emojiRegex);
      expect(t.preheader).not.toMatch(emojiRegex);
      expect(t.headerTitle).not.toMatch(emojiRegex);
      expect(t.greetingText).not.toMatch(emojiRegex);
      expect(t.bodyText).not.toMatch(emojiRegex);
      expect(t.primaryButtonText).not.toMatch(emojiRegex);
      expect(t.footerNotes).not.toMatch(emojiRegex);
    }
  });

  it('interpolates sampleData cleanly without leaving unmatched undefined tags in essential fields', () => {
    for (const [_key, scenario] of Object.entries(EMAIL_SCENARIOS)) {
      const subject = interpolateEmailVariables(scenario.defaultTemplate.subject, scenario.sampleData);
      expect(subject).not.toContain('undefined');
      expect(subject).not.toContain('null');

      const body = interpolateEmailVariables(scenario.defaultTemplate.bodyText, scenario.sampleData);
      expect(body).not.toContain('undefined');
      expect(body).not.toContain('null');

      const greeting = interpolateEmailVariables(scenario.defaultTemplate.greetingText, scenario.sampleData);
      expect(greeting).not.toContain('undefined');
    }
  });

  it('parses scenarioTemplates and activeScenario safely in parseEmailMasterPayload', () => {
    const rawPayload = {
      template: {
        subject: 'Master Subject',
        bodyText: 'Master Body',
      },
      activeScenario: 'checkout_otp',
      scenarioTemplates: {
        checkout_otp: {
          subject: 'Custom OTP Subject {{otp_code}}',
          bodyText: 'Custom OTP Body',
        },
        invalid_key: {
          subject: 'Should be ignored',
        },
      },
    };

    const parsed = parseEmailMasterPayload(rawPayload);
    expect(parsed).not.toBeNull();
    expect(parsed?.activeScenario).toBe('checkout_otp');
    expect(parsed?.scenarioTemplates?.checkout_otp?.subject).toBe('Custom OTP Subject {{otp_code}}');
    expect((parsed?.scenarioTemplates as Record<string, unknown>)?.invalid_key).toBeUndefined();
  });

  it('getScenarioDefinition falls back gracefully to ticket_delivery for unknown keys', () => {
    const fallback = getScenarioDefinition('non_existent_key' as EmailScenarioKey);
    expect(fallback.id).toBe('ticket_delivery');
  });

  it('generates valid default presets for all 13 scenarios via getDefaultScenarioPresets', () => {
    const allKeys = Object.keys(EMAIL_SCENARIOS) as EmailScenarioKey[];
    expect(allKeys).toHaveLength(13);

    for (const key of allKeys) {
      const presets = getDefaultScenarioPresets(key);
      expect(presets.length).toBeGreaterThanOrEqual(1);
      const first = presets[0];
      expect(first.id).toBeTruthy();
      expect(first.name).toBeTruthy();
      expect(first.template).toBeTruthy();
      expect(first.template.subject).toBeTruthy();
      expect(first.template.bodyText).toBeTruthy();
    }
  });

  it('parses scenarioPresets and scenarioActivePresetIds in parseEmailMasterPayload with backwards compatibility', () => {
    const rawPayload = {
      template: {
        subject: 'Master Ticket Subject',
        bodyText: 'Master Ticket Body',
      },
      presets: [
        {
          id: 'preset-default-master',
          name: 'เทมเพลตมาตรฐานหลัก (Default Master)',
          template: {
            subject: 'Master Ticket Subject',
            bodyText: 'Master Ticket Body',
          },
        },
      ],
      activePresetId: 'preset-default-master',
      scenarioPresets: {
        checkout_otp: [
          {
            id: 'preset-otp-custom-1',
            name: 'เทมเพลต OTP แบบทางการ',
            template: {
              subject: 'รหัส OTP ของคุณคือ {{otp_code}}',
              bodyText: 'กรุณากรอกรหัส OTP ใน 5 นาที',
            },
          },
        ],
      },
      scenarioActivePresetIds: {
        checkout_otp: 'preset-otp-custom-1',
      },
    };

    const parsed = parseEmailMasterPayload(rawPayload);
    expect(parsed).not.toBeNull();
    expect(parsed?.scenarioPresets?.checkout_otp).toHaveLength(1);
    expect(parsed?.scenarioPresets?.checkout_otp?.[0].id).toBe('preset-otp-custom-1');
    expect(parsed?.scenarioActivePresetIds?.checkout_otp).toBe('preset-otp-custom-1');

    // Backwards compatibility sync for ticket_delivery
    expect(parsed?.scenarioPresets?.ticket_delivery).toBeDefined();
    expect(parsed?.scenarioPresets?.ticket_delivery?.[0].id).toBe('preset-default-master');
    expect(parsed?.scenarioActivePresetIds?.ticket_delivery).toBe('preset-default-master');
  });
});
