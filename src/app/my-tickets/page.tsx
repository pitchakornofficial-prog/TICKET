import { GuestOrderLookupView } from '@/components/guest-order-lookup-view';

export const metadata = {
  title: 'ค้นหาบัตรของฉัน | TICKET',
  description: 'ค้นหาและเปิดดูบัตรคอนเสิร์ตที่สั่งซื้อ พร้อม QR Code สำหรับเข้างาน',
};

interface MyTicketsPageProps {
  searchParams: Promise<{ orderId?: string }>;
}

export default async function MyTicketsPage({ searchParams }: MyTicketsPageProps) {
  const { orderId } = await searchParams;

  return (
    <div className="my-tickets-page" style={{ minHeight: 'calc(100vh - 200px)', padding: '20px 0' }}>
      <GuestOrderLookupView initialOrderId={orderId} />
    </div>
  );
}
