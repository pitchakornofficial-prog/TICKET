import { OrderSuccessView } from '@/components/order-success-view';

export const metadata = {
  title: 'ชำระเงินสำเร็จ ออกบัตรคอนเสิร์ตเรียบร้อยแล้ว | TICKET',
  description: 'ออกบัตรคอนเสิร์ตดิจิทัลสำเร็จ พร้อมดาวน์โหลดรูปบัตรสำหรับเข้าชมงาน',
};

interface OrderSuccessPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderSuccessPage({ params }: OrderSuccessPageProps) {
  const { id } = await params;

  return <OrderSuccessView orderId={id} />;
}
