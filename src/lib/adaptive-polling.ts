export interface ComputePollDelayOptions {
  baseIntervalMs: number;
  minIntervalMs?: number;
  maxIntervalMs: number;
  consecutiveBackoffs?: number;
  backoffMultiplier?: number;
  jitterRatio?: number;
  isHidden?: boolean;
  hiddenIntervalMs?: number;
  randomFn?: () => number;
}

/**
 * Computes an adaptive polling delay with exponential backoff, tab-visibility scaling,
 * and symmetric jitter to prevent synchronized thundering herds.
 */
export function computeAdaptivePollDelayMs(options: ComputePollDelayOptions): number {
  const {
    baseIntervalMs,
    minIntervalMs = 1500,
    maxIntervalMs,
    consecutiveBackoffs = 0,
    backoffMultiplier = 1.6,
    jitterRatio = 0.2,
    isHidden = false,
    hiddenIntervalMs = 12000,
    randomFn = Math.random,
  } = options;

  let delay = Math.max(minIntervalMs, baseIntervalMs);
  if (consecutiveBackoffs > 0) {
    delay = delay * backoffMultiplier ** consecutiveBackoffs;
  }
  if (isHidden) {
    delay = Math.max(delay, hiddenIntervalMs);
  }
  delay = Math.min(maxIntervalMs, delay);

  if (jitterRatio > 0) {
    const clampedRatio = Math.min(0.5, jitterRatio);
    const rand = Math.min(1, Math.max(0, randomFn()));
    const factor = 1 + (rand * 2 - 1) * clampedRatio;
    delay = delay * factor;
  }

  return Math.round(Math.max(minIntervalMs, Math.min(maxIntervalMs, delay)));
}

export interface PollStepResult {
  stop?: boolean;
  backoff?: boolean;
  nextDelayMs?: number;
}

export interface AdaptivePollerOptions {
  baseIntervalMs?: number;
  minIntervalMs?: number;
  maxIntervalMs?: number;
  hiddenIntervalMs?: number;
  backoffMultiplier?: number;
  jitterRatio?: number;
  immediate?: boolean;
  step: (ctx: {
    signal: AbortSignal;
    attempt: number;
    consecutiveBackoffs: number;
  }) => Promise<PollStepResult | undefined>;
}

/**
 * Starts a non-overlapping recursive setTimeout poller that waits for each
 * in-flight request to settle before scheduling the next poll with jitter & backoff.
 */
export function startAdaptivePoller(options: AdaptivePollerOptions): () => void {
  const {
    baseIntervalMs = 3000,
    minIntervalMs = 1500,
    maxIntervalMs = 15000,
    hiddenIntervalMs = 12000,
    backoffMultiplier = 1.6,
    jitterRatio = 0.2,
    immediate = true,
    step,
  } = options;

  let disposed = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let activeController: AbortController | null = null;
  let attempt = 0;
  let consecutiveBackoffs = 0;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const scheduleNext = (suggestedDelayMs?: number) => {
    if (disposed) return;
    clearTimer();
    const isHidden =
      typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const delay = computeAdaptivePollDelayMs({
      baseIntervalMs: suggestedDelayMs ?? baseIntervalMs,
      minIntervalMs,
      maxIntervalMs,
      consecutiveBackoffs,
      backoffMultiplier,
      jitterRatio,
      isHidden,
      hiddenIntervalMs,
    });
    timer = setTimeout(() => {
      void runStep();
    }, delay);
  };

  const runStep = async () => {
    if (disposed || inFlight) return;
    inFlight = true;
    clearTimer();
    attempt += 1;

    const controller = new AbortController();
    activeController = controller;
    let shouldStop = false;
    let suggestedDelayMs: number | undefined;

    try {
      const result = await step({
        signal: controller.signal,
        attempt,
        consecutiveBackoffs,
      });

      if (disposed || controller.signal.aborted) {
        return;
      }

      if (result?.stop) {
        shouldStop = true;
        return;
      }

      if (result?.backoff) {
        consecutiveBackoffs = Math.min(consecutiveBackoffs + 1, 6);
      } else {
        consecutiveBackoffs = 0;
      }
      suggestedDelayMs = result?.nextDelayMs;
    } catch {
      if (disposed || controller.signal.aborted) {
        return;
      }
      consecutiveBackoffs = Math.min(consecutiveBackoffs + 1, 6);
    } finally {
      inFlight = false;
      if (activeController === controller) {
        activeController = null;
      }
      if (!disposed && !shouldStop) {
        scheduleNext(suggestedDelayMs);
      }
    }
  };

  const handleVisibilityChange = () => {
    if (disposed || typeof document === 'undefined') return;
    if (document.visibilityState === 'visible' && !inFlight) {
      clearTimer();
      void runStep();
    }
  };

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  if (immediate) {
    void runStep();
  } else {
    scheduleNext();
  }

  return () => {
    disposed = true;
    clearTimer();
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
}
