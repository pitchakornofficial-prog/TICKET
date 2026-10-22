import { redirect } from 'next/navigation';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get('orderId');
  const target = orderId ? `/my-tickets?orderId=${encodeURIComponent(orderId)}` : '/my-tickets';
  redirect(target);
}
