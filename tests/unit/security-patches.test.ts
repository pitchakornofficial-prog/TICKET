import { describe, expect, it, vi } from 'vitest';
import { handleAuthRequest } from '../../src/server/auth-http';
import type { TicketAuth } from '../../src/server/auth';
import { validateUploadedFile } from '../../src/server/file-validator';
import { GET } from '../../src/app/api/dev/captured-emails/route';

describe('Production security boundaries', () => {
  it('rejects the test inspection endpoint without reaching auth', async () => {
    const handler = vi.fn();
    const auth = { handler } as unknown as TicketAuth;
    const response = await handleAuthRequest(auth, new Request('https://ticket.example/api/auth/test-inspect-reset-token'));
    expect(response.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects captured emails in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const response = await GET(new Request('http://localhost:3000/api/dev/captured-emails'));
      expect(response.status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects oversized, disallowed and disguised uploads', () => {
    expect(validateUploadedFile(Buffer.alloc(15 * 1024 * 1024 + 1), 'image/png', 'poster.png', 'public').valid).toBe(false);
    expect(validateUploadedFile(Buffer.from('text'), 'text/plain', 'poster.txt', 'public').valid).toBe(false);
    expect(validateUploadedFile(Buffer.from('not a png'), 'image/png', 'poster.png', 'public').valid).toBe(false);
  });
});
