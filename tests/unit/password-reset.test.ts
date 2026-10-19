import { describe, expect, it } from 'vitest';
import {
  RESET_COOLDOWN_SECONDS,
  RESET_MAX_REQUESTS_IN_WINDOW,
  RESET_TOKEN_EXPIRATION_SECONDS,
  RESET_WINDOW_SECONDS,
} from '../../src/server/password-reset';

describe('password reset security constants under G-18/ADR-0004', () => {
  it('enforces 30-minute token expiration and 60-second cooldown', () => {
    expect(RESET_TOKEN_EXPIRATION_SECONDS).toBe(1800);
    expect(RESET_COOLDOWN_SECONDS).toBe(60);
  });

  it('enforces maximum 3 requests per 15-minute sliding window', () => {
    expect(RESET_MAX_REQUESTS_IN_WINDOW).toBe(3);
    expect(RESET_WINDOW_SECONDS).toBe(900);
  });
});
