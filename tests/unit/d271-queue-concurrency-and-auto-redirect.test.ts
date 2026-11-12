import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QUEUE_CAPACITY, QUEUE_HOLD_MINUTES } from '../../src/server/queue';

describe('D-271: 200-Slot Concurrency Gateway & Auto-Advancing Queue Room', () => {
  const rootDir = resolve(__dirname, '../..');

  it('defines QUEUE_CAPACITY as 200 and QUEUE_HOLD_MINUTES as 15', () => {
    expect(QUEUE_CAPACITY).toBe(200);
    expect(QUEUE_HOLD_MINUTES).toBe(15);
  });

  it('records D-271 in docs/requirement.md with agreed details and zero emojis', () => {
    const requirementContent = readFileSync(
      resolve(rootDir, 'docs/requirement.md'),
      'utf-8',
    );
    expect(requirementContent).toContain('D-271');
    expect(requirementContent).toContain('200-Slot Concurrency Gateway & Auto-Advancing Queue Room');
    expect(requirementContent).toContain('200 สิทธิ์');
    expect(requirementContent).toContain('Auto-Redirect');

    const d271Line = requirementContent
      .split('\n')
      .find(line => line.includes('D-271')) || '';
    expect(d271Line).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('implements queue status API and server queue schema', () => {
    const queueServerCode = readFileSync(
      resolve(rootDir, 'src/server/queue.ts'),
      'utf-8',
    );
    expect(queueServerCode).toContain('event_queue_entries');
    expect(queueServerCode).toContain('QUEUE_CAPACITY');
    expect(queueServerCode).toContain('getOrCreateQueueEntry');
    expect(queueServerCode).toContain('completeQueueEntry');

    const apiRouteCode = readFileSync(
      resolve(rootDir, 'src/app/api/events/[id]/queue/status/route.ts'),
      'utf-8',
    );
    expect(apiRouteCode).toContain('getOrCreateQueueEntry');
    expect(apiRouteCode).toContain('export async function GET');

    const queueComponent = readFileSync(
      resolve(rootDir, 'src/components/queue-waiting-room.tsx'),
      'utf-8',
    );
    expect(queueComponent).toContain('/api/events/' + '$' + '{eventId}/queue/status');
  });

  it('implements automatic redirect and smooth progression in QueueWaitingRoom without requiring manual click', () => {
    const queueComponent = readFileSync(
      resolve(rootDir, 'src/components/queue-waiting-room.tsx'),
      'utf-8',
    );
    // Automatic redirect effect
    expect(queueComponent).toContain('peopleAhead <= 0 && isReady');
    expect(queueComponent).toContain('router.push(' + '`/events/' + '$' + '{eventId}/checkout`)');
    expect(queueComponent).toContain('isRedirectingRef');

    // Required DOM elements and backward compatibility
    expect(queueComponent).toContain('currentStep="queue"');
    expect(queueComponent).toContain('id="queue-number-display"');
    expect(queueComponent).toContain('id="queue-ahead-count"');
    expect(queueComponent).toContain('id="proceed-to-checkout-btn"');

    // Zero Emojis (D-14)
    expect(queueComponent).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
