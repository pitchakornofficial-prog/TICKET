'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useState, useEffect, type ReactNode } from 'react';
import { TicketIcon } from './ticket-icon';
import { NavbarSearch } from './navbar-search';
import { BookOpenIcon, LockIcon, PhoneIcon, SearchIcon, UsersIcon } from './icons';

function HomeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const isBackOffice = pathname?.startsWith('/back-office');

  const isFocusedCheckout = Boolean(
    pathname &&
      (/\/events\/[^/]+\/(queue|checkout)$/.test(pathname) ||
        /\/orders\/[^/]+\/payment$/.test(pathname)),
  );

  useEffect(() => {
    if (pathname) {
      setIsMobileMenuOpen(false);
      setIsMobileSearchOpen(false);
    }
  }, [pathname]);

  const handleBrandExitClick = (e: React.MouseEvent) => {
    if (typeof window === 'undefined') return;
    const confirmed = window.confirm(
      'คุณแน่ใจหรือไม่ที่จะออกจากหน้านี้? หากกำลังรอคิวหรืออยู่ในขั้นตอนการซื้อบัตร ข้อมูลการกันบัตรของคุณจะถูกยกเลิก',
    );
    if (!confirmed) {
      e.preventDefault();
    }
  };

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
      <header className={`site-header ${isFocusedCheckout ? 'focused-checkout-header' : ''}`}>
        <div className="site-header-inner">
          <div className="header-brand-wrap">
            <Link
              href="/"
              className="brand"
              aria-label="TICKET หน้าแรก"
              onClick={isFocusedCheckout ? handleBrandExitClick : undefined}
            >
              <TicketIcon />
              TICKET
            </Link>
          </div>

          {isFocusedCheckout ? (
            <div className="focused-checkout-badge-wrap">
              <div className="focused-checkout-security-text">
                <LockIcon style={{ width: '14px', height: '14px', color: '#64748b' }} />
                <span>ระบบชำระเงินปลอดภัย 256-bit SSL</span>
              </div>
            </div>
          ) : (
            <>
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

              {/* Mobile Header Actions (D-189: Search & Hamburger with Mutually Exclusive Toggle) */}
              <div className="mobile-header-actions">
                <button
                  type="button"
                  className="mobile-search-btn"
                  aria-label={isMobileSearchOpen ? 'ปิดช่องค้นหา' : 'เปิดช่องค้นหา'}
                  aria-expanded={isMobileSearchOpen}
                  onClick={() => {
                    setIsMobileSearchOpen(prev => !prev);
                    setIsMobileMenuOpen(false);
                  }}
                >
                  {isMobileSearchOpen ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  ) : (
                    <SearchIcon style={{ width: '20px', height: '20px' }} />
                  )}
                </button>

                <button
                  type="button"
                  className="mobile-hamburger-btn"
                  aria-label={isMobileMenuOpen ? 'ปิดเมนูนำทาง' : 'เปิดเมนูนำทาง'}
                  aria-expanded={isMobileMenuOpen}
                  onClick={() => {
                    setIsMobileMenuOpen(prev => !prev);
                    setIsMobileSearchOpen(false);
                  }}
                >
                  {isMobileMenuOpen ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="4" y1="6" x2="20" y2="6" />
                      <line x1="4" y1="12" x2="20" y2="12" />
                      <line x1="4" y1="18" x2="20" y2="18" />
                    </svg>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Mobile Floating Search Overlay (D-189) */}
        {isMobileSearchOpen && !isFocusedCheckout && (
          <section className="mobile-search-overlay" aria-label="ช่องค้นหาคอนเสิร์ต">
            <Suspense fallback={<div className="navbar-search-wrapper" />}>
              <NavbarSearch />
            </Suspense>
          </section>
        )}

        {/* Mobile Floating Navigation Dropdown (D-188, D-189: Floating overlay with icons) */}
        {isMobileMenuOpen && !isFocusedCheckout && (
          <nav className="mobile-nav-dropdown" aria-label="เมนูหลักสำหรับมือถือ">
            <Link className="mobile-nav-link" href="/" onClick={() => setIsMobileMenuOpen(false)}>
              <HomeIcon className="mobile-nav-icon" />
              <span>หน้าแรก</span>
            </Link>
            <Link className="mobile-nav-link" href="/my-tickets" onClick={() => setIsMobileMenuOpen(false)}>
              <TicketIcon className="mobile-nav-icon" />
              <span>ค้นหาบัตรของฉัน</span>
            </Link>
            <Link className="mobile-nav-link" href="/news" onClick={() => setIsMobileMenuOpen(false)}>
              <BookOpenIcon className="mobile-nav-icon" />
              <span>ข่าวสาร</span>
            </Link>
            <Link className="mobile-nav-link" href="/about" onClick={() => setIsMobileMenuOpen(false)}>
              <UsersIcon className="mobile-nav-icon" />
              <span>เกี่ยวกับเรา</span>
            </Link>
            <Link className="mobile-nav-link" href="/contact" onClick={() => setIsMobileMenuOpen(false)}>
              <PhoneIcon className="mobile-nav-icon" />
              <span>ติดต่อเรา</span>
            </Link>
          </nav>
        )}
      </header>

      <main id="main" tabIndex={-1}>{children}</main>

      {/* Hide footer in focused checkout flow to prevent sticky bar overlap (D-188) */}
      {!isFocusedCheckout && (
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
      )}
    </div>
  );
}
