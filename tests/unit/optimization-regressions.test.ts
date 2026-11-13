import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAdaptivePoller } from '../../src/lib/adaptive-polling';

describe('Adaptive polling terminal lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not resume a terminal poll after a tab becomes visible', async () => {
    vi.useFakeTimers();
    const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('document', document);
    const step = vi.fn().mockResolvedValue({ stop: true });
    const dispose = startAdaptivePoller({ step, baseIntervalMs: 3000, jitterRatio: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(step).toHaveBeenCalledTimes(1);

    document.visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    document.visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60000);
    expect(step).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('aborts an outstanding request on disposal without scheduling another poll', async () => {
    vi.useFakeTimers();
    const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('document', document);
    let activeSignal: AbortSignal | undefined;
    const step = vi.fn(({ signal }: { signal: AbortSignal }) => {
      activeSignal = signal;
      return new Promise<undefined>(resolve => signal.addEventListener('abort', () => resolve(undefined)));
    });
    const dispose = startAdaptivePoller({ step, baseIntervalMs: 3000, jitterRatio: 0 });
    expect(activeSignal?.aborted).toBe(false);
    dispose();
    expect(activeSignal?.aborted).toBe(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60000);
    expect(step).toHaveBeenCalledTimes(1);
  });
});
