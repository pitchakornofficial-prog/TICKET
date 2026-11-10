/**
 * Concert CSV Snapshot & Export Utility (D-227)
 * Generates structured CSV representations of concert configuration
 * for admin revision backups and historical audit preservation.
 */

export interface ConcertSnapshotData {
  id: string;
  title: string;
  location: string;
  organizerName?: string;
  organizerEmail?: string;
  status?: string;
  description?: string;
  ageRestriction?: string;
  refundPolicy?: string;
  entryGuidelines?: string;
  payoutBankName?: string;
  payoutAccountNumber?: string;
  payoutAccountName?: string;
  ubuPrivilegeMode?: boolean;
  organizerFeeRate?: number;
  customerFeeRate?: number;
  reservePercentage?: number;
  sessions?: Array<{
    id: string;
    startTime: string;
    endTime: string;
    ticketTypes?: Array<{
      id: string;
      name: string;
      price: number;
      quota: number;
      isStudentPrivilege?: boolean;
    }>;
  }>;
}

/**
 * Escapes a single CSV field following RFC 4180
 */
function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Generates a full CSV string representing the concert's current snapshot.
 */
export function generateConcertCsvSnapshot(concert: ConcertSnapshotData): string {
  const timestamp = new Date().toISOString();
  const rows: string[][] = [
    ['--- CONCERT METADATA SNAPSHOT ---', ''],
    ['Snapshot Timestamp (UTC)', timestamp],
    ['Concert ID', concert.id],
    ['Concert Title', concert.title],
    ['Organizer Name', concert.organizerName || '-'],
    ['Organizer Email', concert.organizerEmail || '-'],
    ['Location / Venue', concert.location],
    ['Current Status', concert.status || 'draft'],
    ['Description', concert.description || '-'],
    ['Age Restriction', concert.ageRestriction || 'all_ages'],
    ['Refund Policy', concert.refundPolicy || 'standard'],
    ['Entry Guidelines', concert.entryGuidelines || '-'],
    ['Payout Bank Name', concert.payoutBankName || '-'],
    ['Payout Account Number', concert.payoutAccountNumber || '-'],
    ['Payout Account Name', concert.payoutAccountName || '-'],
    ['UBU Student Privilege Mode', concert.ubuPrivilegeMode ? 'ENABLED' : 'DISABLED'],
    ['Organizer Platform Fee (%)', String(concert.organizerFeeRate ?? 3.0)],
    ['Customer Service Fee (%)', String(concert.customerFeeRate ?? 0.0)],
    ['Reserve Percentage (%)', String(concert.reservePercentage ?? 0.0)],
    ['', ''],
    ['--- SESSIONS AND TICKET TIERS ---', '', '', '', ''],
    ['Session ID', 'Start Time', 'End Time', 'Ticket Tier Name', 'Price (THB)', 'Quota', 'Is Student Privilege'],
  ];

  if (concert.sessions && concert.sessions.length > 0) {
    for (const session of concert.sessions) {
      if (session.ticketTypes && session.ticketTypes.length > 0) {
        for (const tt of session.ticketTypes) {
          rows.push([
            session.id,
            session.startTime,
            session.endTime,
            tt.name,
            String(tt.price),
            String(tt.quota),
            tt.isStudentPrivilege ? 'YES' : 'NO',
          ]);
        }
      } else {
        rows.push([session.id, session.startTime, session.endTime, 'No ticket tiers defined', '0', '0', 'NO']);
      }
    }
  } else {
    rows.push(['No sessions defined', '-', '-', '-', '0', '0', 'NO']);
  }

  return rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}

/**
 * Initiates browser download of the generated CSV snapshot.
 */
export function triggerCsvDownload(csvContent: string, filename: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
