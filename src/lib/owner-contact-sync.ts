// Owner Contact Information Synchronization (D-208)

export interface OwnerContactInfo {
  hotline: string;
  hotlineBadge: string;
  hotlineNote: string;
  email: string;
  emailBadge: string;
  emailNote: string;
  lineId: string;
  lineBadge: string;
  lineNote: string;
  operatingHours: string;
  operatingHoursNote: string;
  address: string;
  addressNote: string;
}

export const DEFAULT_OWNER_CONTACT_INFO: OwnerContactInfo = {
  hotline: '02-123-4567, 089-999-8888',
  hotlineBadge: '24 ชม. วันแสดงงาน',
  hotlineNote: 'สำหรับกรณีฉุกเฉิน ระบบหน้างาน และการสแกนบัตรขัดข้อง',
  email: 'organizer-support@ticket.co.th',
  emailBadge: 'ตอบใน 2-4 ชม.',
  emailNote: 'ส่งเอกสารการเงิน บัญชีรับเงิน และคำขอแก้ไขงาน',
  lineId: '@ticket-organizer',
  lineBadge: 'แชทสะดวก',
  lineNote: 'พิมพ์พูดคุย สอบถามข้อมูล หรือแจ้งเตือนสถานะแบบเรียลไทม์',
  operatingHours: 'จันทร์ - ศุกร์ : 09:00 - 18:00 น.',
  operatingHoursNote: 'วันเสาร์ - อาทิตย์ และวันแสดงคอนเสิร์ต: มีเจ้าหน้าที่สแตนด์บายดูแลผ่านสายด่วนตลอดงาน',
  address: 'อาคารทิกเก็ตเทคโนโลยี เลขที่ 88 ชั้น 12 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110',
  addressNote: 'สำนักงานใหญ่ (ติดต่อทางไปรษณีย์หรือนัดหมายล่วงหน้า)',
};

export const STORAGE_KEY_OWNER_CONTACT = 'ticket_owner_contact_info';
export const EVENT_OWNER_CONTACT_CHANGED = 'ticket:owner-contact-changed';

export function loadOwnerContactInfo(): OwnerContactInfo {
  if (typeof window === 'undefined') {
    return DEFAULT_OWNER_CONTACT_INFO;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OWNER_CONTACT);
    if (!raw) return DEFAULT_OWNER_CONTACT_INFO;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_OWNER_CONTACT_INFO,
      ...parsed,
    };
  } catch {
    return DEFAULT_OWNER_CONTACT_INFO;
  }
}

export function saveOwnerContactInfo(info: OwnerContactInfo): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_OWNER_CONTACT, JSON.stringify(info));
    window.dispatchEvent(new CustomEvent(EVENT_OWNER_CONTACT_CHANGED, { detail: info }));
  } catch (error) {
    console.warn('Failed to save owner contact info to storage', error);
  }
}

export function resetOwnerContactInfo(): OwnerContactInfo {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY_OWNER_CONTACT);
      window.dispatchEvent(new CustomEvent(EVENT_OWNER_CONTACT_CHANGED, { detail: DEFAULT_OWNER_CONTACT_INFO }));
    } catch (error) {
      console.warn('Failed to reset owner contact info', error);
    }
  }
  return DEFAULT_OWNER_CONTACT_INFO;
}
