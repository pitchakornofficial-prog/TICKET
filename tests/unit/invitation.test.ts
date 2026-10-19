import { describe, expect, it } from 'vitest';
import {
  INVITATION_EXPIRATION_HOURS,
  INVITATION_EXPIRATION_SECONDS,
} from '../../src/server/invitation';

describe('organizer invitation security constants under G-18/ADR-0004', () => {
  it('enforces 48-hour expiration for organizer invitations', () => {
    expect(INVITATION_EXPIRATION_HOURS).toBe(48);
    expect(INVITATION_EXPIRATION_SECONDS).toBe(48 * 60 * 60);
    expect(INVITATION_EXPIRATION_SECONDS).toBe(172800);
  });
});
