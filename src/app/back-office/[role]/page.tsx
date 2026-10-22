import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getAuth, readActor } from '@/server/auth';
import { isRole, roleAccess } from '@/lib/back-office-access';
import { SignOutButton } from '@/components/sign-out-button';
import { InviteOrganizerForm } from '@/components/invite-organizer-form';
import { OrganizerEventsManager } from '@/components/organizer-events-manager';
import { OwnerSessionApprovalManager } from '@/components/owner-session-approval-manager';
import { OwnerNewsManager } from '@/components/owner-news-manager';
import { OwnerFeeSettingsManager } from '@/components/owner-fee-settings-manager';
import { OwnerPaymentRecoveryManager } from '@/components/owner-payment-recovery-manager';
import { OwnerEmailDeliveriesManager } from '@/components/owner-email-deliveries-manager';
import { OwnerContactCorrectionManager } from '@/components/owner-contact-correction-manager';
import { OwnerRefundApprovalManager } from '@/components/owner-refund-approval-manager';
import { OwnerWeeklyPayoutManager } from '@/components/owner-weekly-payout-manager';
import { OwnerReserveReleaseManager } from '@/components/owner-reserve-release-manager';
import { OwnerDebtRepaymentManager } from '@/components/owner-debt-repayment-manager';
import { OwnerSyncConflictManager } from '@/components/owner-sync-conflict-manager';
import { OrganizerScannerManager } from '@/components/organizer-scanner-manager';
import { ScannerEventsView } from '@/components/scanner-events-view';

const roleNames = { owner: 'เจ้าของเว็บ', organizer: 'ผู้จัดงาน', scanner: 'ทีมสแกนบัตร' };

export default async function Workspace({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!isRole(role)) notFound();
  const actor = await readActor(getAuth(), await headers());
  const access = roleAccess(actor, role);
  if (access === 'unauthenticated') redirect('/login');
  if (access !== 'allowed' || !actor) notFound();
  return (
    <section className="opening account-page" aria-labelledby="workspace-title">
      <div className="opening-copy account-copy workspace-copy">
        <p className="eyebrow">TICKET / พื้นที่ทีมงาน</p>
        <h1 id="workspace-title">พื้นที่{roleNames[role]}</h1>
        <p className="intro">ยินดีต้อนรับ {actor.name}</p>
        <dl className="account-details"><div><dt>ชื่อบัญชี</dt><dd>{actor.name}</dd></div><div><dt>บทบาท</dt><dd>{roleNames[actor.role]}</dd></div></dl>
        <p className="account-note">คุณเข้าสู่ระบบด้วยสิทธิ์{roleNames[actor.role]}<br />การเข้าสู่ระบบมีอายุสูงสุด 8 ชั่วโมง</p>
        {role === 'owner' && (
          <>
            <InviteOrganizerForm />
            <OwnerSessionApprovalManager />
            <OwnerNewsManager />
            <OwnerFeeSettingsManager />
            <OwnerPaymentRecoveryManager />
            <OwnerEmailDeliveriesManager />
            <OwnerContactCorrectionManager />
            <OwnerRefundApprovalManager />
            <OwnerWeeklyPayoutManager />
            <OwnerReserveReleaseManager />
            <OwnerDebtRepaymentManager />
            <OwnerSyncConflictManager />
          </>
        )}
        {role === 'organizer' && (
          <>
            <OrganizerEventsManager />
            <OrganizerScannerManager />
          </>
        )}
        {role === 'scanner' && <ScannerEventsView />}
        <SignOutButton />
      </div>
    </section>
  );
}
