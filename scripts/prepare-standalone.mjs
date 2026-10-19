import { cp, mkdir } from 'node:fs/promises';

// Next traces server dependencies; static assets must accompany the standalone server.
await mkdir('.next/standalone/.next', { recursive: true });
await cp('.next/static', '.next/standalone/.next/static', { recursive: true });
