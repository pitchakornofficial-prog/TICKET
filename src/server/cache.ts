import { revalidateTag } from 'next/cache';

/**
 * Purges a Next.js Data Cache tag on-demand, safely ignoring calls made outside
 * a Next.js request context (such as Vitest unit/integration tests).
 */
export function safeRevalidateTag(tag: string): void {
  try {
    revalidateTag(tag, 'max');
  } catch {
    // No-op outside Next.js server request context
  }
}
