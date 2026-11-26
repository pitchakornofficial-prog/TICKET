import { describe, expect, it } from 'vitest';
import {
  getOfflineModeKey,
  readPersistedOfflineMode,
  writePersistedOfflineMode,
} from '@/lib/offline-admission';
import { shouldWarnBeforeUnload } from '@/components/scanner-admission-terminal';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe('Scanner offline refresh safety', () => {
  it('warns before unload when offline mode is active or pending scans exist', () => {
    expect(shouldWarnBeforeUnload(false, 0)).toBe(false);
    expect(shouldWarnBeforeUnload(true, 0)).toBe(true);
    expect(shouldWarnBeforeUnload(false, 3)).toBe(true);
    expect(shouldWarnBeforeUnload(true, 2)).toBe(true);
  });

  it('persists and clears offline mode per event in storage', () => {
    const storage = createMemoryStorage();
    const eventId = 'event-ubu-freshy-2026';

    expect(getOfflineModeKey(eventId)).toBe('ticket_scanner_offline_mode_event-ubu-freshy-2026');
    expect(readPersistedOfflineMode(eventId, storage)).toBe(false);

    writePersistedOfflineMode(eventId, true, storage);
    expect(readPersistedOfflineMode(eventId, storage)).toBe(true);
    expect(readPersistedOfflineMode('other-event', storage)).toBe(false);

    writePersistedOfflineMode(eventId, false, storage);
    expect(readPersistedOfflineMode(eventId, storage)).toBe(false);
  });
});
