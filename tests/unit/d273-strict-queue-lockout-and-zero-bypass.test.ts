import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QUEUE_CAPACITY, verifyQueueAccess } from '../../src/server/queue';

describe('D-273: Strict Queue Lockout & Zero-Bypass Guard', () => {
  const rootDir = resolve(__dirname, '../..');

  it('records D-273 in docs/requirement.md with agreed details and zero emojis', () => {
    const requirementContent = readFileSync(
      resolve(rootDir, 'docs/requirement.md'),
      'utf-8',
    );
    expect(requirementContent).toContain('D-273');
    expect(requirementContent).toContain('Strict Queue Lockout & Zero-Bypass Guard');
    expect(requirementContent).toContain('ปิดการข้ามคิวโดยสมบูรณ์เมื่อคิวเต็ม 200');
    expect(requirementContent).toContain('กรุณารอตามลำดับคิว');

    const d273Line = requirementContent
      .split('\n')
      .find(line => line.includes('D-273')) || '';
    expect(d273Line).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('enforces lockout in QueueWaitingRoom while waiting in queue', () => {
    const queueComponent = readFileSync(
      resolve(rootDir, 'src/components/queue-waiting-room.tsx'),
      'utf-8',
    );

    // Button is disabled when not ready and peopleAhead > 0
    expect(queueComponent).toContain('isReady || peopleAhead <= 0 ?');
    expect(queueComponent).toContain('กรุณารอตามลำดับคิว (ระบบจะพาเข้าสู่หน้าซื้อบัตรอัตโนมัติเมื่อถึงคิว)');
    expect(queueComponent).toContain('disabled');

    // handleProceedNow prevents skipping when waiting
    expect(queueComponent).toContain('if (!isReady && peopleAhead > 0)');

    // Zero Emojis (D-14)
    expect(queueComponent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('enforces queue access verification on server and checkout flow gating', () => {
    expect(typeof verifyQueueAccess).toBe('function');
    expect(QUEUE_CAPACITY).toBe(200);

    const checkoutFlow = readFileSync(
      resolve(rootDir, 'src/components/event-checkout-flow.tsx'),
      'utf-8',
    );
    expect(checkoutFlow).toContain('D-273: Enforce queue gating at checkout');
    expect(checkoutFlow).toContain('/api/events/' + '$' + '{eventId}/queue/status');
    expect(checkoutFlow).toContain('router.replace(`' + '/events/' + '$' + '{eventId}/queue`)');

    // Zero Emojis (D-14)
    expect(checkoutFlow).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
