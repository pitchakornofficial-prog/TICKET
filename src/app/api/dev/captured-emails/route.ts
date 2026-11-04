import { getCapturedEmails, clearCapturedEmails } from '@/server/email';

export const runtime = 'nodejs';

export async function GET() {
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
