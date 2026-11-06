import { describe, expect, it, vi } from 'vitest';
import {
  createSafeErrorResponse,
  formatSafeApiError,
  isDatabaseOrInternalError,
} from '@/server/api-error';

describe('API Error Sanitization (Issue 13 / CWE-209)', () => {
  it('identifies PostgreSQL driver DatabaseError by SQLSTATE code', () => {
    const pgError = Object.assign(new Error('relation "users" does not exist'), {
      code: '42P01',
      severity: 'ERROR',
      table: 'users',
    });

    expect(isDatabaseOrInternalError(pgError)).toBe(true);
  });

  it('identifies unique constraint violations and suppresses sensitive DB details', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const duplicateKeyErr = Object.assign(
      new Error('duplicate key value violates unique constraint "users_email_key"'),
      {
        code: '23505',
        table: 'users',
        constraint: 'users_email_key',
        detail: 'Key (email)=(attacker@test.com) already exists.',
      },
    );

    const result = formatSafeApiError(
      duplicateKeyErr,
      'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง',
    );

    expect(result.status).toBe(500);
    expect(result.message).toBe('เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง');
    expect(result.message).not.toContain('users_email_key');
    expect(result.message).not.toContain('duplicate key');
    expect(consoleSpy).toHaveBeenCalledWith('[API Internal Error]:', duplicateKeyErr);
    consoleSpy.mockRestore();
  });

  it('identifies SQL syntax errors and suppresses them', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const syntaxErr = new Error('syntax error at or near "SELECT"');

    const result = formatSafeApiError(
      syntaxErr,
      'เกิดข้อผิดพลาดในการดึงข้อมูล',
    );

    expect(result.status).toBe(500);
    expect(result.message).toBe('เกิดข้อผิดพลาดในการดึงข้อมูล');
    consoleSpy.mockRestore();
  });

  it('identifies runtime TypeErrors and returns generic message', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const typeErr = new TypeError('Cannot read properties of undefined (reading "id")');

    const result = formatSafeApiError(
      typeErr,
      'เกิดข้อผิดพลาดในการประมวลผล',
    );

    expect(result.status).toBe(500);
    expect(result.message).toBe('เกิดข้อผิดพลาดในการประมวลผล');
    consoleSpy.mockRestore();
  });

  it('allows safe user-facing domain validation messages through', () => {
    const domainErr = new Error('กรุณายืนยันตัวตนผ่าน OTP ก่อนดำเนินการกันบัตร');

    const result = formatSafeApiError(
      domainErr,
      'เกิดข้อผิดพลาดในการกันบัตร',
      {
        defaultStatus: 400,
        statusResolver: (msg) => (msg.includes('OTP') ? 401 : 400),
      },
    );

    expect(result.status).toBe(401);
    expect(result.message).toBe('กรุณายืนยันตัวตนผ่าน OTP ก่อนดำเนินการกันบัตร');
  });

  it('createSafeErrorResponse generates a valid Response with generic message on DB error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dbErr = Object.assign(new Error('null value in column "amount" violates not-null constraint'), {
      code: '23502',
      table: 'orders',
      column: 'amount',
    });

    const response = createSafeErrorResponse(
      dbErr,
      'เกิดข้อผิดพลาดในการสร้างคำสั่งซื้อ',
      { defaultStatus: 400 },
    );

    expect(response.status).toBe(500); // Elevates to 500 because it is a DB error, not a client 400
    const body = await response.json();
    expect(body.message).toBe('เกิดข้อผิดพลาดในการสร้างคำสั่งซื้อ');
    expect(body.message).not.toContain('amount');
    expect(body.message).not.toContain('orders');
    consoleSpy.mockRestore();
  });
});
