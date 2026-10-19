import { TicketIcon } from '@/components/ticket-icon';

export default function Home() {
  return (
    <section className="opening" aria-labelledby="opening-title">
      <div className="opening-copy">
        <p className="eyebrow">คอนเสิร์ต · ดนตรี · ความทรงจำ</p>
        <h1 id="opening-title">เวทีต่อไป<br />ความทรงจำครั้งใหม่</h1>
        <p className="intro">พื้นที่สำหรับคนรักดนตรี<br />และช่วงเวลาที่อยากอยู่หน้าเวที</p>
        <div className="opening-notice"><TicketIcon /><div><h2>กำลังเตรียมเปิดให้บริการ</h2><p>ยังไม่เปิดจำหน่ายบัตรในขณะนี้</p></div></div>
      </div>
      <div className="opening-mark" aria-hidden="true"><span className="vertical-word">LIVE MUSIC</span><TicketIcon className="large-ticket" /><span className="mark-caption">TICKET</span></div>
    </section>
  );
}
