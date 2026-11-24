import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAuth, readActor } from '@/server/auth';
import { roleAccess } from '@/lib/back-office-access';
import { TicketIcon } from '@/components/ticket-icon';
import { AdminDateTimeDisplay } from '@/components/admin-date-time-display';
import { AdminEmailDesigner } from '@/components/admin-email-designer';

export const metadata: Metadata = {
  title: 'ระบบออกแบบและเขียนอีเมล (Admin Email Designer) — TICKET',
  description: 'ออกแบบเนื้อหา ตัวแปร รูปแบบบัตร คิวอาร์โค้ด และปุ่มกดสำหรับอีเมลคอนเสิร์ต',
};

export default async function EmailDesignerPage() {
  const requestHeaders = await headers();
  const actor = await readActor(getAuth(), requestHeaders);
  if (!actor) redirect('/login');
  if (roleAccess(actor, 'owner') !== 'allowed') notFound();

  return (
    <section
      className="admin-portal-wrapper ticket-designer-1920-root"
      style={{
        width: '100%',
        maxWidth: '1920px',
        margin: '0 auto',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      aria-labelledby="email-designer-page-title"
    >
      <h1 id="email-designer-page-title" className="sr-only">
        ระบบออกแบบและเขียนอีเมล
      </h1>

      {/* Top Header Bar */}
      <header className="admin-topbar">
        <div className="admin-topbar-left">
          <Link href="/back-office/owner" className="admin-brand-badge" title="TICKET Back-Office">
            <TicketIcon />
            <span className="brand admin-brand-name">TICKET</span>
          </Link>
          <AdminDateTimeDisplay />
        </div>

        <div className="admin-topbar-right">
          <Link
            href="/back-office/owner?tab=customer"
            className="designer-btn secondary"
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
          >
            กลับสู่ Back Office
          </Link>
        </div>
      </header>

      {/* Main Designer Canvas */}
      <div
        className="admin-portal-body"
        style={{ padding: 0, flex: 1, height: 'calc(100vh - 65px)', overflow: 'hidden' }}
      >
        <AdminEmailDesigner />
      </div>
    </section>
  );
}
