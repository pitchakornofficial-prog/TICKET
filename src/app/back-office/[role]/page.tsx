import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuth, readActor } from '@/server/auth';
import { isRole, roleAccess } from '@/lib/back-office-access';
import { SignOutButton } from '@/components/sign-out-button';
import { OrganizerWorkspaceView } from '@/components/organizer-workspace-view';
import { ScannerEventsView } from '@/components/scanner-events-view';
import { OwnerWorkspaceView } from '@/components/owner-workspace-view';
import { TicketIcon } from '@/components/ticket-icon';
import { AdminDateTimeDisplay } from '@/components/admin-date-time-display';
import { AdminNotificationsMenu } from '@/components/admin-notifications-menu';

const roleNames = { owner: 'เจ้าของเว็บ', organizer: 'ผู้จัดงาน', scanner: 'ทีมสแกนบัตร' };

export default async function Workspace({
  params,
  searchParams,
}: {
  params: Promise<{ role: string }>;
  searchParams?: Promise<{ section?: string }>;
}) {
  const { role } = await params;
  if (!isRole(role)) notFound();
  const actor = await readActor(getAuth(), await headers());
  const access = roleAccess(actor, role);
  if (access === 'unauthenticated') redirect('/login');
  if (access !== 'allowed' || !actor) notFound();
  const search = searchParams ? await searchParams : undefined;

  return (
    <section className="admin-portal-wrapper" aria-labelledby="workspace-title">
      <h1 id="workspace-title" className="sr-only">
        พื้นที่{roleNames[role]}
      </h1>

      {/* Clean Top Header Bar (D-76) */}
      <header className="admin-topbar">
        <div className="admin-topbar-left">
          <Link href={`/back-office/${role}`} className="admin-brand-badge" title="TICKET Back-Office">
            <TicketIcon />
            <span className="brand admin-brand-name">TICKET</span>
          </Link>
          <AdminDateTimeDisplay />
        </div>

        <div className="admin-topbar-right">
          <div className="admin-user-profile-stack">
            <span className="admin-user-name-large">{actor.name}</span>
            <span className="admin-user-role-sub">{roleNames[actor.role]}</span>
          </div>
          <AdminNotificationsMenu />
          <div className="admin-logout-wrap">
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Main Admin Workspace Canvas */}
      <div className="admin-portal-body">
        {role === 'owner' && <OwnerWorkspaceView initialSection={search?.section} />}
        {role === 'organizer' && <OrganizerWorkspaceView initialSection={search?.section} />}
        {role === 'scanner' && (
          <div className="scanner-workspace-canvas">
            <ScannerEventsView />
          </div>
        )}
      </div>
    </section>
  );
}
