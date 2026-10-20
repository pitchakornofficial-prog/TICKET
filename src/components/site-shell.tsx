import Link from 'next/link';
import type { ReactNode } from 'react';
import { TicketIcon } from './ticket-icon';

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">ข้ามไปเนื้อหาหลัก</a>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="TICKET หน้าแรก">
          <TicketIcon />
          TICKET
        </Link>
        <nav className="header-nav" aria-label="เมนูหลัก">
          <Link className="header-nav-link" href="/">หน้าแรก</Link>
          <Link className="header-nav-link" href="/about">เกี่ยวกับเรา</Link>
          <Link className="header-nav-link" href="/contact">ติดต่อเรา</Link>
          <Link className="header-caption" href="/login">เข้าสู่ระบบหลังบ้าน</Link>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="site-footer">
        <div className="footer-columns">
          <div className="footer-col brand-col">
            <span className="footer-brand">TICKET</span>
            <span className="footer-tagline">ทุกความทรงจำ เริ่มต้นหน้าเวที</span>
            <p className="footer-desc">
              แพลตฟอร์มจำหน่ายบัตรคอนเสิร์ตในประเทศไทย ซื้อบัตรได้สะดวกรวดเร็วโดยไม่ต้องสมัครสมาชิก
            </p>
          </div>
          <div className="footer-col">
            <h3 className="footer-heading">เมนูหลัก</h3>
            <ul className="footer-links">
              <li><Link href="/">หน้าแรก / คอนเสิร์ต</Link></li>
              <li><Link href="/about">เกี่ยวกับเรา</Link></li>
              <li><Link href="/contact">ติดต่อเรา</Link></li>
            </ul>
          </div>
          <div className="footer-col">
            <h3 className="footer-heading">เงื่อนไขและนโยบาย</h3>
            <ul className="footer-links">
              <li><Link href="/terms">เงื่อนไขการซื้อและรับบัตร</Link></li>
              <li><Link href="/refund-policy">นโยบายคืนเงิน / ยกเลิก / เลื่อนงาน</Link></li>
              <li><Link href="/privacy">นโยบายความเป็นส่วนตัว</Link></li>
            </ul>
          </div>
          <div className="footer-col">
            <h3 className="footer-heading">ทีมงานและผู้จัดงาน</h3>
            <ul className="footer-links">
              <li><Link href="/login">เข้าสู่ระบบหลังบ้าน</Link></li>
              <li><Link href="/contact">ติดต่อฝากขายบัตร</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 TICKET. สงวนลิขสิทธิ์ทั้งหมด · เวลามาตรฐานประเทศไทย (Asia/Bangkok)</p>
        </div>
      </footer>
    </div>
  );
}
