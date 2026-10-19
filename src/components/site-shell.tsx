import Link from 'next/link';
import type { ReactNode } from 'react';
import { TicketIcon } from './ticket-icon';

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">ข้ามไปเนื้อหาหลัก</a>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="TICKET หน้าแรก"><TicketIcon />TICKET</Link>
        <Link className="header-caption" href="/login">เข้าสู่ระบบหลังบ้าน</Link>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="site-footer"><span>TICKET</span><span>ทุกความทรงจำ เริ่มต้นหน้าเวที</span></footer>
    </div>
  );
}
