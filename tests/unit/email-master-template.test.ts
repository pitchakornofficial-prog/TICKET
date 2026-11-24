import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMAIL_MASTER_TEMPLATE,
  interpolateEmailVariables,
  parseEmailMasterTemplate,
} from '../../src/server/email-master-template';

describe('Email Master Template & Interpolation', () => {
  it('has valid default template', () => {
    expect(DEFAULT_EMAIL_MASTER_TEMPLATE.subject).toContain('[TICKET]');
    expect(DEFAULT_EMAIL_MASTER_TEMPLATE.showTicketCard).toBe(true);
  });
  it('parses valid template and applies defaults for missing fields', () => {
    const parsed = parseEmailMasterTemplate({
      subject: 'ยินดีต้อนรับสู่ {{concert_name}}',
      bodyText: 'ขอบคุณที่ซื้อบัตร {{total_tickets}} ใบ',
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.subject).toBe('ยินดีต้อนรับสู่ {{concert_name}}');
    expect(parsed?.bodyText).toBe('ขอบคุณที่ซื้อบัตร {{total_tickets}} ใบ');
    expect(parsed?.showTicketCard).toBe(true);
    expect(parsed?.showQrCode).toBe(true);
    expect(parsed?.primaryButtonText).toBe('เปิดดูบัตรผ่านเว็บไซต์');
  });

  it('rejects invalid inputs without required string fields', () => {
    expect(parseEmailMasterTemplate(null)).toBeNull();
    expect(parseEmailMasterTemplate([])).toBeNull();
    expect(parseEmailMasterTemplate({ subject: 123 })).toBeNull();
  });

  it('interpolates all variables properly without throwing or leaking undefined', () => {
    const templateText =
      'งาน: {{concert_name}} | ผู้ซื้อ: {{buyer_name}} | รหัส: {{ticket_code}} | ประเภท: {{ticket_type}} | ราคา: {{ticket_price}} | จำนวน: {{total_tickets}} | วันที่: {{session_date}} | เวลา: {{session_time}} | สถานที่: {{location}} | ออเดอร์: {{order_id}}';

    const result = interpolateEmailVariables(templateText, {
      concert_name: 'ROCK ON 2026',
      buyer_name: 'คุณสมศักดิ์',
      ticket_code: 'TK-001',
      ticket_type: 'VIP',
      ticket_price: '2,500 บาท',
      total_tickets: 2,
      session_date: '15/12/2026',
      session_time: '19:00',
      location: 'Impact Arena',
      order_id: 'ORD-12345',
    });

    expect(result).toBe(
      'งาน: ROCK ON 2026 | ผู้ซื้อ: คุณสมศักดิ์ | รหัส: TK-001 | ประเภท: VIP | ราคา: 2,500 บาท | จำนวน: 2 | วันที่: 15/12/2026 | เวลา: 19:00 | สถานที่: Impact Arena | ออเดอร์: ORD-12345',
    );
  });
});
