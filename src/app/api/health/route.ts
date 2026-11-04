export const dynamic = 'force-dynamic';

// Liveness only. Deployment smoke checks must verify the database separately.
export function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
