import { getAuth } from '@/server/auth';
import { handleAuthRequest } from '@/server/auth-http';

export const runtime = 'nodejs';
export async function GET(request: Request) { return handleAuthRequest(getAuth(), request); }
export async function POST(request: Request) { return handleAuthRequest(getAuth(), request); }
