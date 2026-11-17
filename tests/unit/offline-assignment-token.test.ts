import { describe, expect, it } from 'vitest';
import {
  createOfflineAssignmentToken,
  verifyOfflineAssignmentToken,
} from '../../src/server/offline-assignment-token';

describe('offline primary assignment proof', () => {
  const claims = { eventId: 'event-1', scannerId: 'scanner-1', assignmentEpoch: 12 };

  it('verifies a signed event, scanner, and handover epoch tuple', () => {
    const token = createOfflineAssignmentToken(claims);
    expect(verifyOfflineAssignmentToken(token, claims)).toBe(true);
  });

  it('rejects altered scope, epoch, and token signatures', () => {
    const token = createOfflineAssignmentToken(claims);
    expect(verifyOfflineAssignmentToken(token, { ...claims, eventId: 'event-2' })).toBe(false);
    expect(verifyOfflineAssignmentToken(token, { ...claims, scannerId: 'scanner-2' })).toBe(false);
    expect(verifyOfflineAssignmentToken(token, { ...claims, assignmentEpoch: 13 })).toBe(false);
    expect(verifyOfflineAssignmentToken(`${token.slice(0, -2)}xx`, claims)).toBe(false);
  });
});
