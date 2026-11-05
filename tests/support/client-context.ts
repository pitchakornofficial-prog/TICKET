import { createHash } from 'node:crypto';
import type { Browser, BrowserContextOptions, TestInfo } from '@playwright/test';

const contextCounters = new WeakMap<TestInfo, number>();

// Synthetic private client identities isolate each journey's real shared rate limits.
// These are header values only; browsers still connect solely to loopback.
export function testClientIp(info: TestInfo, identity = 'primary'): string {
  const bytes = createHash('sha256').update(`${info.project.name}:${info.testId}:${info.repeatEachIndex}:${identity}`).digest();
  return `10.${bytes[0]}.${bytes[1]}.${bytes[2]}`;
}

export function createIsolatedBrowserContext(browser: Browser, info: TestInfo, options: BrowserContextOptions = {}) {
  const index = (contextCounters.get(info) || 0) + 1;
  contextCounters.set(info, index);
  return browser.newContext({
    ...info.project.use,
    ...options,
    extraHTTPHeaders: {
      ...info.project.use?.extraHTTPHeaders,
      ...options.extraHTTPHeaders,
      'x-forwarded-for': testClientIp(info, `context-${index}`),
    },
  });
}
