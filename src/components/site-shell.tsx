'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { TicketIcon } from './ticket-icon';
import { NavbarSearch } from './navbar-search';

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isBackOffice = pathname?.startsWith('/back-office');

  if (isBackOffice) {
    return (
      <div className="site-shell back-office-shell">
        <a className="skip-link" href="#main">ข้ามไปเนื้อหาหลัก</a>
        <main id="main" className="back-office-main-canvas" tabIndex={-1}>
          {children}
        </main>
        <footer className="back-office-minimal-footer">
          <div className="back-office-footer-inner">
            <p>TICKET Back Office Portal · เวลามาตรฐานประเทศไทย (Asia/Bangkok) · สงวนลิขสิทธิ์ 2026</p>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">ข้ามไปเนื้อหาหลัก</a>
      <header className="site-header">
        <div className="site-header-inner">
          <div className="header-brand-wrap">
            <Link href="/" className="brand" aria-label="TICKET หน้าแรก">
              <TicketIcon />
              TICKET
            </Link>
          </div>

          {/* Center Navbar Instant Search */}
          <div className="header-search-center">
            <Suspense fallback={<div className="navbar-search-wrapper" />}>
              <NavbarSearch />
            </Suspense>
          </div>

          <nav className="header-nav" aria-label="เมนูหลัก">
            <Link className="header-nav-link" href="/">หน้าแรก</Link>
            <Link className="header-nav-link" href="/my-tickets">ค้นหาบัตรของฉัน</Link>
            <Link className="header-nav-link" href="/news">ข่าวสาร</Link>
            <Link className="header-nav-link" href="/about">เกี่ยวกับเรา</Link>
            <Link className="header-nav-link" href="/contact">ติดต่อเรา</Link>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="site-footer">
        <div className="site-footer-inner">
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
                <li><Link href="/my-tickets">ค้นหาบัตรของฉัน</Link></li>
                <li><Link href="/news">ข่าวสารและประกาศ</Link></li>
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
                <li><Link href="/contact">ติดต่อฝากขายบัตร</Link></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>Copyright 2026 TICKET. สงวนลิขสิทธิ์ทั้งหมด · เวลามาตรฐานประเทศไทย (Asia/Bangkok)</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
