import { OrderPaymentView } from '@/components/order-payment-view';

export const metadata = {
  title: 'ชำระเงินและรับบัตรคอนเสิร์ต | TICKET',
  description: 'ชำระเงินผ่าน PromptPay QR และรับบัตรคอนเสิร์ตดิจิทัลพร้อม QR Code สำหรับเข้างาน',
};

interface OrderPaymentPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderPaymentPage({ params }: OrderPaymentPageProps) {
  const { id } = await params;

  return <OrderPaymentView orderId={id} />;
}
