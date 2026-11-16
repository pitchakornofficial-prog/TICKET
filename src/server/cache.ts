import { revalidateTag } from 'next/cache';

/**
 * Purges a Next.js Data Cache tag on-demand, safely ignoring calls made outside
 * a Next.js request context (such as Vitest unit/integration tests).
 */
export function safeRevalidateTag(tag: string): void {
  try {
    // Mutations must be visible on the very next read. 'max' permits one stale
    // response while refreshing, which is incorrect after approval/publication.
    revalidateTag(tag, { expire: 0 });
  } catch {
    // No-op outside Next.js server request context
  }
}
