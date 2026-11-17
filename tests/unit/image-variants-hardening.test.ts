import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharpState = vi.hoisted(() => ({
  options: [] as Array<{ limitInputPixels: number }>,
  active: 0,
  maxActive: 0,
  delayMs: 10,
}));

vi.mock('sharp', () => ({
  default: (_input: Buffer, options: { limitInputPixels: number }) => {
    sharpState.options.push(options);
    const pipeline = {
      rotate: () => pipeline,
      resize: () => pipeline,
      avif: () => pipeline,
      webp: () => pipeline,
      jpeg: () => pipeline,
      png: () => pipeline,
      toBuffer: async () => {
        sharpState.active += 1;
        sharpState.maxActive = Math.max(sharpState.maxActive, sharpState.active);
        await new Promise(resolve => setTimeout(resolve, sharpState.delayMs));
        sharpState.active -= 1;
        return Buffer.from('variant');
      },
    };
    return pipeline;
  },
}));

import {
  ImageTransformCapacityError,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_TRANSFORMS,
  MAX_QUEUED_IMAGE_TRANSFORMS,
  transformPublicImage,
} from '../../src/server/image-variants';

describe('public image transformation resource limits', () => {
  beforeEach(() => {
    sharpState.options.length = 0;
    sharpState.active = 0;
    sharpState.maxActive = 0;
  });

  it('passes the decoded pixel ceiling to Sharp for every conversion', async () => {
    await transformPublicImage('pixel-limit-check', Buffer.from('source'), 'image/png', {
      width: 320,
      format: null,
    });

    expect(MAX_IMAGE_PIXELS).toBeGreaterThan(0);
    expect(sharpState.options).toEqual([{ limitInputPixels: MAX_IMAGE_PIXELS }]);
  });

  it('limits active Sharp jobs and rejects excess waiters when the queue is full', async () => {
    const requests = Array.from({ length: MAX_IMAGE_TRANSFORMS + MAX_QUEUED_IMAGE_TRANSFORMS + 1 }, (_, index) =>
      transformPublicImage(`queue-${index}`, Buffer.from(`source-${index}`), 'image/png', {
        width: 320,
        format: null,
      }),
    );
    const results = await Promise.allSettled(requests);

    expect(sharpState.maxActive).toBe(MAX_IMAGE_TRANSFORMS);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(ImageTransformCapacityError);
  });
});
