import Link from 'next/link';

export default function NotFound() {
  return <section className="opening-copy account-copy"><p className="eyebrow">TICKET / พื้นที่ทีมงาน</p><h1>ไม่พบหน้าหรือไม่มีสิทธิ์เข้าถึง</h1><p className="intro">กรุณากลับไปยังพื้นที่ทำงานของบัญชีคุณ</p><Link className="primary-button button-link" href="/back-office">กลับพื้นที่ทำงาน</Link></section>;
}
