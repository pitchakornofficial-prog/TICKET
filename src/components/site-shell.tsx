'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect, useRef, type ReactNode } from 'react';
import { TicketIcon } from './ticket-icon';
import { NavbarSearch } from './navbar-search';
import { AlertIcon } from './alert-icon';
import { BookOpenIcon, PhoneIcon, SearchIcon, UsersIcon } from './icons';

function HomeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [pendingExitUrl, setPendingExitUrl] = useState<string | null>(null);
  const pendingExitCallbackRef = useRef<(() => void) | null>(null);
  const isBypassingGuardRef = useRef(false);
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
      isBypassingGuardRef.current = false;
    }
  }, [pathname]);

  // Listen for custom exit request from child pages (e.g. back to event details button)
  useEffect(() => {
    const handleCustomExit = (e: Event) => {
      const detail = (e as CustomEvent<{ targetUrl?: string; onConfirm?: () => void }>).detail;
      setPendingExitUrl(detail?.targetUrl || '/');
      pendingExitCallbackRef.current = detail?.onConfirm || null;
      setIsExitModalOpen(true);
    };

    window.addEventListener('ticket:request-exit', handleCustomExit);
    return () => {
      window.removeEventListener('ticket:request-exit', handleCustomExit);
    };
  }, []);

  // History PopState Guard: Trap browser Back and Forward navigation during focused checkout
  useEffect(() => {
    if (!isFocusedCheckout) return;

    window.history.pushState({ ticketCheckoutGuard: true }, '', window.location.href);

    const handlePopState = () => {
      if (isBypassingGuardRef.current) return;
      // Push state back to prevent leaving
      window.history.pushState({ ticketCheckoutGuard: true }, '', window.location.href);
      setPendingExitUrl('__BROWSER_BACK__');
      pendingExitCallbackRef.current = null;
      setIsExitModalOpen(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isFocusedCheckout]);

  // BeforeUnload Guard: Trap browser Reload and Tab Close
  useEffect(() => {
    if (!isFocusedCheckout) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isBypassingGuardRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isFocusedCheckout]);

  const handleNavClick = (e: React.MouseEvent, href: string) => {
    if (isFocusedCheckout) {
      e.preventDefault();
      setPendingExitUrl(href);
      pendingExitCallbackRef.current = null;
      setIsExitModalOpen(true);
      setIsMobileMenuOpen(false);
      setIsMobileSearchOpen(false);
    }
  };

  const handleConfirmExit = () => {
    isBypassingGuardRef.current = true;
    setIsExitModalOpen(false);

    const callback = pendingExitCallbackRef.current;
    pendingExitCallbackRef.current = null;
    if (callback) {
      try {
        callback();
      } catch {
        // ignore callback errors
      }
    }

    if (pendingExitUrl === '__BROWSER_BACK__') {
      setPendingExitUrl(null);
      window.history.back();
    } else if (pendingExitUrl) {
      const url = pendingExitUrl;
      setPendingExitUrl(null);
      router.push(url);
    }
  };

  const handleCancelExit = () => {
    setIsExitModalOpen(false);
    setPendingExitUrl(null);
    pendingExitCallbackRef.current = null;
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
              onClick={e => handleNavClick(e, '/')}
            >
              <TicketIcon />
              TICKET
            </Link>
          </div>

          {/* Center Navbar Instant Search */}
          <div
            className="header-search-center"
            onClickCapture={e => {
              if (isFocusedCheckout) {
                e.preventDefault();
                e.stopPropagation();
                setPendingExitUrl('/');
                pendingExitCallbackRef.current = null;
                setIsExitModalOpen(true);
              }
            }}
            onFocusCapture={e => {
              if (isFocusedCheckout) {
                e.preventDefault();
                e.stopPropagation();
                (e.target as HTMLElement)?.blur();
                setPendingExitUrl('/');
                pendingExitCallbackRef.current = null;
                setIsExitModalOpen(true);
              }
            }}
          >
            <Suspense fallback={<div className="navbar-search-wrapper" />}>
              <NavbarSearch />
            </Suspense>
          </div>

          <nav className="header-nav" aria-label="เมนูหลัก">
            <Link className="header-nav-link" href="/" onClick={e => handleNavClick(e, '/')}>หน้าแรก</Link>
            <Link className="header-nav-link" href="/my-tickets" onClick={e => handleNavClick(e, '/my-tickets')}>ค้นหาบัตรของฉัน</Link>
            <Link className="header-nav-link" href="/news" onClick={e => handleNavClick(e, '/news')}>ข่าวสาร</Link>
            <Link className="header-nav-link" href="/about" onClick={e => handleNavClick(e, '/about')}>เกี่ยวกับเรา</Link>
            <Link className="header-nav-link" href="/contact" onClick={e => handleNavClick(e, '/contact')}>ติดต่อเรา</Link>
          </nav>

          {/* Mobile Header Actions (D-189: Search & Hamburger with Mutually Exclusive Toggle) */}
          <div className="mobile-header-actions">
            <button
              type="button"
              className="mobile-search-btn"
              aria-label={isMobileSearchOpen ? 'ปิดช่องค้นหา' : 'เปิดช่องค้นหา'}
              aria-expanded={isMobileSearchOpen}
              onClick={e => {
                if (isFocusedCheckout) {
                  e.preventDefault();
                  setPendingExitUrl('/');
                  pendingExitCallbackRef.current = null;
                  setIsExitModalOpen(true);
                  return;
                }
                setIsMobileSearchOpen(prev => !prev);
                setIsMobileMenuOpen(false);
              }}
            >
              <SearchIcon style={{ width: '20px', height: '20px' }} />
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
        </div>

        {/* Mobile Floating Search Overlay (D-189) */}
        {isMobileSearchOpen && (
          <section className="mobile-search-overlay" aria-label="ช่องค้นหาคอนเสิร์ต">
            <Suspense fallback={<div className="navbar-search-wrapper" />}>
              <NavbarSearch />
            </Suspense>
          </section>
        )}

        {/* Mobile Floating Navigation Dropdown (D-188, D-189: Floating overlay with icons) */}
        {isMobileMenuOpen && (
          <nav className="mobile-nav-dropdown" aria-label="เมนูหลักสำหรับมือถือ">
            <Link className="mobile-nav-link" href="/" onClick={e => { setIsMobileMenuOpen(false); handleNavClick(e, '/'); }}>
              <HomeIcon className="mobile-nav-icon" />
              <span>หน้าแรก</span>
            </Link>
            <Link className="mobile-nav-link" href="/my-tickets" onClick={e => { setIsMobileMenuOpen(false); handleNavClick(e, '/my-tickets'); }}>
              <TicketIcon className="mobile-nav-icon" />
              <span>ค้นหาบัตรของฉัน</span>
            </Link>
            <Link className="mobile-nav-link" href="/news" onClick={e => { setIsMobileMenuOpen(false); handleNavClick(e, '/news'); }}>
              <BookOpenIcon className="mobile-nav-icon" />
              <span>ข่าวสาร</span>
            </Link>
            <Link className="mobile-nav-link" href="/about" onClick={e => { setIsMobileMenuOpen(false); handleNavClick(e, '/about'); }}>
              <UsersIcon className="mobile-nav-icon" />
              <span>เกี่ยวกับเรา</span>
            </Link>
            <Link className="mobile-nav-link" href="/contact" onClick={e => { setIsMobileMenuOpen(false); handleNavClick(e, '/contact'); }}>
              <PhoneIcon className="mobile-nav-icon" />
              <span>ติดต่อเรา</span>
            </Link>
          </nav>
        )}
      </header>

      {/* Push content downward on mobile when search overlay is open so it does not obscure topmost content */}
      {isMobileSearchOpen && (
        <div className="mobile-search-flow-spacer" aria-hidden="true" />
      )}

      {/* Styled Checkout Exit Confirmation Modal */}
      {isExitModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-exit-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: 'var(--white)',
              borderRadius: '20px',
              maxWidth: '420px',
              width: '100%',
              padding: '2rem 1.75rem',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
              border: '1px solid #fed7aa',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#fff7ed',
                color: '#ea580c',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem',
              }}
            >
              <AlertIcon style={{ width: '32px', height: '32px' }} />
            </div>

            <h2
              id="checkout-exit-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 500,
                color: 'var(--black)',
                margin: '0 0 0.75rem',
              }}
            >
              ยืนยันการออกจากหน้านี้?
            </h2>

            <p style={{ fontSize: '0.92rem', color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
              ท่านกำลังอยู่ในขั้นตอนการทำรายการซื้อบัตร หากออกจากหน้านี้ การกันสิทธิ์บัตรหรือลำดับคิวของท่านอาจถูกยกเลิก
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={handleCancelExit}
                className="primary-button"
                style={{
                  width: '100%',
                  padding: '0.8rem 1.5rem',
                  borderRadius: '9999px',
                  fontSize: '0.95rem',
                  fontWeight: 400,
                  cursor: 'pointer',
                }}
              >
                ทำรายการต่อ
              </button>
              <button
                type="button"
                onClick={handleConfirmExit}
                style={{
                  width: '100%',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '9999px',
                  fontSize: '0.92rem',
                  color: '#dc2626',
                  background: 'transparent',
                  border: '1px solid #fecaca',
                  cursor: 'pointer',
                  fontWeight: 400,
                  transition: 'background 0.15s ease',
                }}
              >
                ออกจากหน้านี้
              </button>
            </div>
          </div>
        </div>
      )}

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
