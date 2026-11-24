import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAuth, readActor } from '@/server/auth.ts';
import { TicketIcon } from '@/components/ticket-icon.tsx';
import { AdminDateTimeDisplay } from '@/components/admin-date-time-display.tsx';
import { TicketInspectorView } from '@/components/ticket-inspector-view.tsx';

export const metadata: Metadata = {
  title: 'ระบบตรวจสอบคิวอาร์โค้ดบัตรคอนเสิร์ต (Ticket QR Inspector) — TICKET',
  description: 'สแกนคิวอาร์โค้ด ตรวจสอบความถูกต้อง สถานะการใช้งาน โควตา ข้อมูลผู้ซื้อ และประวัติการเข้างาน',
};

export default async function TicketInspectorPage() {
  const requestHeaders = await headers();
  const actor = await readActor(getAuth(), requestHeaders);
  if (!actor) redirect('/login');
  if (!['owner', 'organizer', 'scanner'].includes(actor.role)) notFound();

  const backLink =
    actor.role === 'owner'
      ? '/back-office/owner'
      : actor.role === 'organizer'
      ? '/back-office/organizer'
      : '/back-office/scanner';

  return (
    <section
      className="admin-portal-wrapper"
      style={{
        width: '100%',
        maxWidth: '1440px',
        margin: '0 auto',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
      aria-labelledby="inspector-page-title"
    >
      <h1 id="inspector-page-title" className="sr-only">
        ระบบตรวจสอบและทดสอบคิวอาร์โค้ดจากบัตร
      </h1>

      {/* Top Header Bar */}
      <header className="admin-topbar">
        <div className="admin-topbar-left">
          <Link href={backLink} className="admin-brand-badge" title="TICKET Back-Office">
            <TicketIcon />
            <span className="brand admin-brand-name">TICKET</span>
          </Link>
          <AdminDateTimeDisplay />
        </div>

        <div className="admin-topbar-right">
          <Link
            href={backLink}
            className="secondary-button"
            style={{ fontSize: '0.8125rem', padding: '0.4rem 0.8rem', height: '36px' }}
          >
            <span>กลับสู่ Back Office ({actor.role})</span>
          </Link>
        </div>
      </header>

      {/* Main Inspector View */}
      <main className="admin-portal-body" style={{ padding: 0, flex: 1 }}>
        <TicketInspectorView />
      </main>
    </section>
  );
}
