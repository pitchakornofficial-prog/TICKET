import { getCapturedEmails, clearCapturedEmails } from '@/server/email';

export const runtime = 'nodejs';

export async function GET() {
  if (process.env.NODE_ENV === 'production') return new Response(null, { status: 404 });
  const emails = getCapturedEmails();
  return Response.json(
    { emails },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function DELETE() {
  if (process.env.NODE_ENV === 'production') return new Response(null, { status: 404 });
  clearCapturedEmails();
  return Response.json(
    { message: 'ล้างรายการอีเมลจำลองเรียบร้อยแล้ว' },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
