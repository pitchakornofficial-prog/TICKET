import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getAuth, readActor } from '@/server/auth';
import { isRole, roleAccess } from '@/lib/back-office-access';
import { SignOutButton } from '@/components/sign-out-button';
import { OrganizerWorkspaceView } from '@/components/organizer-workspace-view';
import { ScannerEventsView } from '@/components/scanner-events-view';
import { OwnerWorkspaceView } from '@/components/owner-workspace-view';
import { TicketIcon } from '@/components/ticket-icon';

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
      {/* Modern Enterprise Top Header Bar */}
      <header className="admin-topbar">
        <div className="admin-topbar-left">
          <div className="admin-brand-badge">
            <TicketIcon />
            <span className="brand admin-brand-name">TICKET</span>
            <span className="admin-portal-pill">ADMIN</span>
          </div>
          <span className="admin-topbar-separator" aria-hidden="true">/</span>
          <div className="admin-title-wrap">
            <p className="eyebrow admin-eyebrow">TICKET / พื้นที่ทีมงาน</p>
            <h1 id="workspace-title" className="admin-workspace-title">
              พื้นที่{roleNames[role]}
            </h1>
          </div>
        </div>

        <div className="admin-topbar-right">
          <div className="admin-user-profile-badge">
            <div className="admin-user-avatar" aria-hidden="true">
              {actor.name.charAt(0).toUpperCase()}
            </div>
            <div className="admin-user-details">
              <span className="admin-user-name">{actor.name}</span>
              <span className="admin-user-role-pill">{roleNames[actor.role]}</span>
            </div>
            <span className="admin-session-badge">เซสชัน 8 ชม.</span>
          </div>
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
