export type EmailSectionKey = 'poster' | 'body' | 'pass';

export const DEFAULT_EMAIL_SECTION_ORDER: EmailSectionKey[] = ['poster', 'body', 'pass'];

export interface EmailTemplateState {
  subject: string;
  preheader: string;
  headerTitle: string;
  greetingText: string;
  bodyText: string;
  showConcertPoster?: boolean;
  posterUrl?: string;
  showTicketCard: boolean;
  ticketCardTheme: 'dark' | 'white' | 'brand';
  showQrCode: boolean;
  qrSize: number;
  qrHelperText: string;
  primaryButtonText: string;
  primaryButtonColor: string;
  primaryButtonTextColor?: string;
  primaryButtonUrl?: string;
  primaryButtonAlign: 'center' | 'left' | 'right' | 'full';
  showSecondaryButton: boolean;
  secondaryButtonText: string;
  secondaryButtonBgColor?: string;
  secondaryButtonTextColor?: string;
  secondaryButtonBorderColor?: string;
  secondaryButtonAction: 'download_all' | 'custom_url';
  secondaryButtonCustomUrl?: string;
  footerNotes: string;
  sectionOrder?: EmailSectionKey[];
}

export function normalizeEmailSectionOrder(
  input: unknown,
  legacyLayoutOrder?: unknown,
): EmailSectionKey[] {
  const validSet = new Set<EmailSectionKey>(['poster', 'body', 'pass']);
  if (Array.isArray(input) && input.length > 0) {
    const result: EmailSectionKey[] = [];
    for (const item of input) {
      if (typeof item === 'string' && validSet.has(item as EmailSectionKey)) {
        const key = item as EmailSectionKey;
        if (!result.includes(key)) {
          result.push(key);
        }
      }
    }
    for (const fallbackKey of DEFAULT_EMAIL_SECTION_ORDER) {
      if (!result.includes(fallbackKey)) {
        result.push(fallbackKey);
      }
    }
    return result;
  }

  if (typeof legacyLayoutOrder === 'string') {
    if (legacyLayoutOrder === 'poster_pass_body_slip') {
      return ['poster', 'pass', 'body'];
    }
    if (legacyLayoutOrder === 'body_poster_pass_slip') {
      return ['body', 'poster', 'pass'];
    }
  }

  return [...DEFAULT_EMAIL_SECTION_ORDER];
}

export interface EmailTemplatePreset {
  id: string;
  name: string;
  description?: string;
  template: EmailTemplateState;
  updatedAt: string;
}

export type EmailScenarioCategory = 'customer' | 'finance' | 'staff' | 'support';

export interface EmailScenarioCategoryInfo {
  id: EmailScenarioCategory;
  name: string;
  description: string;
}

export const EMAIL_SCENARIO_CATEGORIES: EmailScenarioCategoryInfo[] = [
  {
    id: 'customer',
    name: 'ผู้ซื้อบัตร / ลูกค้า',
    description: 'อีเมลส่งมอบบัตรคอนเสิร์ต รหัส OTP ยืนยันตัวตน และแจ้งเตือนก่อนวันงาน',
  },
  {
    id: 'finance',
    name: 'การเงิน คืนเงิน & นโยบาย',
    description: 'อีเมลแจ้งผลการคืนเงิน เพิกถอนสิทธิ์บัตร และประกาศเลื่อน/ยกเลิกคอนเสิร์ต',
  },
  {
    id: 'staff',
    name: 'ผู้จัดงาน & ทีมงาน',
    description: 'อีเมลออกบัตรตรง สรุปรายได้ส่วนแบ่งผู้จัด คำเชิญทีมงาน และรีเซ็ตรหัสผ่าน',
  },
  {
    id: 'support',
    name: 'ฝ่ายบริการลูกค้า',
    description: 'อีเมลตอบกลับข้อสอบถามและบริการช่วยเหลือผู้ซื้อบัตร',
  },
];

export type EmailScenarioKey =
  | 'ticket_delivery'
  | 'checkout_otp'
  | 'lookup_otp'
  | 'event_reminder'
  | 'refund_approved'
  | 'refund_rejected'
  | 'ticket_revoked'
  | 'event_rescheduled'
  | 'direct_ticket'
  | 'organizer_payout'
  | 'staff_invitation'
  | 'password_reset'
  | 'support_reply';

export interface EmailMergeTag {
  tag: string;
  label: string;
}

export interface EmailScenarioDefinition {
  id: EmailScenarioKey;
  category: EmailScenarioCategory;
  name: string;
  shortLabel: string;
  description: string;
  mergeTags: EmailMergeTag[];
  defaultTemplate: EmailTemplateState;
  sampleData: Record<string, string | number>;
}

export const DEFAULT_EMAIL_MASTER_TEMPLATE: EmailTemplateState = {
  subject: '[TICKET] บัตรคอนเสิร์ตและ QR Code สำหรับเข้างาน - คำสั่งซื้อ {{order_id}}',
  preheader: 'การชำระเงินเสร็จสมบูรณ์แล้ว ระบบได้ออกบัตรคอนเสิร์ต {{concert_name}} ให้ท่านเรียบร้อยแล้ว',
  headerTitle: 'TICKET - บัตรคอนเสิร์ตของคุณ',
  greetingText: 'เรียนคุณ {{buyer_name}},',
  bodyText:
    'การชำระเงินสำหรับคำสั่งซื้อ {{order_id}} เสร็จสมบูรณ์แล้ว ระบบได้ออกบัตรคอนเสิร์ตจำนวน {{total_tickets}} ใบ ให้ท่านเรียบร้อยแล้ว กรุณาตรวจสอบรายละเอียดและบันทึก QR Code เพื่อนำมาแสดง ณ จุดลงทะเบียนเข้าชมการแสดง',
  showConcertPoster: true,
  posterUrl: '',
  showTicketCard: true,
  ticketCardTheme: 'dark',
  showQrCode: true,
  qrSize: 160,
  qrHelperText: '* แสดง QR Code แยกเฉพาะใบต่อเจ้าหน้าที่สแกน ณ ประตูทางเข้าในวันจัดงาน',
  primaryButtonText: 'เปิดดูบัตรผ่านเว็บไซต์',
  primaryButtonColor: '#0f172a',
  primaryButtonTextColor: '#ffffff',
  primaryButtonUrl: '/orders/{{order_id}}/success',
  primaryButtonAlign: 'center',
  showSecondaryButton: false,
  secondaryButtonText: 'ดูรายการคำสั่งซื้อของฉัน',
  secondaryButtonBgColor: '#ffffff',
  secondaryButtonTextColor: '#0f172a',
  secondaryButtonBorderColor: '#cbd5e1',
  secondaryButtonAction: 'custom_url',
  secondaryButtonCustomUrl: '/my-tickets',
  footerNotes:
    'บัตรทุกใบในคำสั่งซื้อนี้ใช้ข้อมูลผู้ซื้อเดียวกัน กรุณาอย่าเปิดเผย QR Code แก่บุคคลอื่น\nอีเมลนี้ส่งจากระบบอัตโนมัติ กรุณาอย่าตอบกลับ หากมีข้อสงสัยโปรดติดต่อฝ่ายบริการลูกค้า',
  sectionOrder: [...DEFAULT_EMAIL_SECTION_ORDER],
};

export const EMAIL_SCENARIOS: Record<EmailScenarioKey, EmailScenarioDefinition> = {
  ticket_delivery: {
    id: 'ticket_delivery',
    category: 'customer',
    name: 'ส่งมอบบัตรคอนเสิร์ต & QR Code',
    shortLabel: 'ส่งมอบบัตร & QR',
    description: 'ส่งมอบบัตรคอนเสิร์ตและรหัส QR Code ทันทีเมื่อผู้ซื้อชำระเงินสำเร็จ',
    mergeTags: [
      { tag: '{{concert_name}}', label: 'ชื่อคอนเสิร์ต' },
      { tag: '{{ticket_code}}', label: 'รหัสบัตร' },
      { tag: '{{ticket_type}}', label: 'ประเภทบัตร' },
      { tag: '{{ticket_price}}', label: 'ราคาบัตร' },
      { tag: '{{buyer_name}}', label: 'ชื่อผู้ซื้อ' },
      { tag: '{{buyer_email}}', label: 'อีเมลผู้ซื้อ' },
      { tag: '{{order_id}}', label: 'รหัสคำสั่งซื้อ' },
      { tag: '{{session_date}}', label: 'วันที่จัดงาน' },
      { tag: '{{session_time}}', label: 'รอบเวลา' },
      { tag: '{{location}}', label: 'สถานที่จัดงาน' },
      { tag: '{{total_tickets}}', label: 'จำนวนบัตร' },
    ],
    defaultTemplate: { ...DEFAULT_EMAIL_MASTER_TEMPLATE },
    sampleData: {
      concert_name: 'TICKET FESTIVAL 2026: LIVE IN BANGKOK',
      buyer_name: 'คุณพงศธร รักดนตรี',
      buyer_email: 'pongsathorn@example.com',
      order_id: 'ORD-20261123-9081',
      total_tickets: 2,
      session_date: '15 ธ.ค. 2026',
      session_time: '19:00',
      location: 'อิมแพ็ค อารีน่า เมืองทองธานี',
      ticket_code: 'TK-202611-0088-01',
      ticket_type: 'VIP Zone A (Seat A-08)',
      ticket_price: '3,500 บาท',
    },
  },

  checkout_otp: {
    id: 'checkout_otp',
    category: 'customer',
    name: 'รหัส OTP ยืนยันการซื้อบัตร',
    shortLabel: 'OTP ซื้อบัตร',
    description: 'ส่งรหัส OTP 6 หลักเพื่อยืนยันตัวตนก่อนการชำระเงินซื้อบัตรคอนเสิร์ต',
    mergeTags: [
      { tag: '{{otp_code}}', label: 'รหัส OTP 6 หลัก' },
      { tag: '{{buyer_name}}', label: 'ชื่อผู้ซื้อ' },
      { tag: '{{concert_name}}', label: 'ชื่อคอนเสิร์ต' },
      { tag: '{{expire_minutes}}', label: 'เวลาหมดอายุ (นาที)' },
    ],
    defaultTemplate: {
      ...DEFAULT_EMAIL_MASTER_TEMPLATE,
      subject: '[TICKET] รหัสยืนยัน OTP สำหรับการซื้อบัตร {{concert_name}}',
      preheader: 'รหัสยืนยัน OTP ของท่านคือ {{otp_code}} (รหัสมีอายุการใช้งาน {{expire_minutes}} นาที)',
      headerTitle: 'TICKET - รหัสยืนยันการทำรายการ (OTP)',
      greetingText: 'เรียนคุณ {{buyer_name}},',
      bodyText:
        'ระบบได้รับคำขอทำรายการซื้อบัตรคอนเสิร์ต {{concert_name}} ของท่าน กรุณานำรหัสยืนยัน OTP 6 หลักด้านล่างนี้ไปกรอกในหน้าทำรายการเพื่อดำเนินการต่อ:',
      showConcertPoster: false,
      showTicketCard: false,
      primaryButtonText: 'กรอกรหัสยืนยันบนหน้าเว็บ',
      primaryButtonUrl: '/checkout',
      footerNotes:
        'รหัส OTP นี้มีอายุการใช้งาน 5 นาที กรุณาอย่าเปิดเผยรหัสนี้แก่บุคคลอื่น เจ้าหน้าที่ไม่มีนโยบายติดต่อเพื่อขอรหัสผ่านหรือรหัส OTP ใดๆ จากท่าน\nหากท่านไม่ได้เป็นผู้ทำรายการ โปรดเพิกเฉยต่ออีเมลฉบับนี้',
    },
    sampleData: {
      otp_code: '159019',
      buyer_name: 'คุณพงศธร รักดนตรี',
      concert_name: 'TICKET FESTIVAL 2026: LIVE IN BANGKOK',
      expire_minutes: '5',
    },
  },

  lookup_otp: {
    id: 'lookup_otp',
    category: 'customer',
    name: 'รหัส OTP ค้นหาและเปิดดูบัตร',
    shortLabel: 'OTP ค้นหาบัตร',
    description: 'ส่งรหัส OTP 6 หลักเมื่อลูกค้าต้องการเปิดดูบัตรคอนเสิร์ตผ่านหน้าค้นหาบัตร',
    mergeTags: [
      { tag: '{{otp_code}}', label: 'รหัส OTP 6 หลัก' },
      { tag: '{{buyer_name}}', label: 'ชื่อผู้ซื้อ' },
      { tag: '{{expire_minutes}}', label: 'เวลาหมดอายุ (นาที)' },
    ],
    defaultTemplate: {
      ...DEFAULT_EMAIL_MASTER_TEMPLATE,
      subject: '[TICKET] รหัสยืนยัน OTP เพื่อเปิดดูข้อมูลบัตรคอนเสิร์ต',
      preheader: 'รหัสยืนยันเพื่อเปิดดูบัตรของท่านคือ {{otp_code}}',
      headerTitle: 'TICKET - รหัสยืนยันเพื่อเปิดดูบัตร',
      greetingText: 'เรียนคุณ {{buyer_name}},',
      bodyText:
        'ระบบได้รับคำขอเปิดดูข้อมูลบัตรคอนเสิร์ตสำหรับบัญชีอีเมลของท่าน กรุณาใช้รหัส OTP 6 หลักด้านล่างนี้เพื่อยืนยันตัวตน หรือคลิกปุ่มยืนยันด้านล่างเพื่อเข้าดูบัตรทันที:',
      showConcertPoster: false,
      showTicketCard: false,
      primaryButtonText: 'ยืนยันและเปิดดูบัตรทันที',
      primaryButtonUrl: '/my-tickets',
      footerNotes:
        'รหัส OTP มีอายุการใช้งาน 10 นาที หากท่านไม่ได้เป็นผู้ร้องขอเปิดดูบัตร โปรดเพิกเฉยต่ออีเมลนี้ ข้อมูลบัตรของท่านยังคงปลอดภัย',
    },
    sampleData: {
      otp_code: '482910',
      buyer_name: 'คุณพงศธร รักดนตรี',
      expire_minutes: '10',
    },
  },

  event_reminder: {
    id: 'event_reminder',
    category: 'customer',
    name: 'แจ้งเตือนก่อนเริ่มคอนเสิร์ต (24-48 ชม.)',
    shortLabel: 'เตือนก่อนวันงาน',
    description: 'ส่งแจ้งเตือนลูกค้าล่วงหน้า 1-2 วันก่อนวันจัดแสดง พร้อมรายละเอียดการเดินทางและกฎระเบียบ',
    mergeTags: [
      { tag: '{{concert_name}}', label: 'ชื่อคอนเสิร์ต' },
      { tag: '{{buyer_name}}', label: 'ชื่อผู้ซื้อ' },
      { tag: '{{session_date}}', label: 'วันที่จัดแสดง' },
      { tag: '{{door_time}}', label: 'เวลาเปิดประตู' },
      { tag: '{{show_time}}', label: 'เวลาเริ่มแสดง' },
      { tag: '{{location}}', label: 'สถานที่จัดงาน' },
      { tag: '{{order_id}}', label: 'รหัสคำสั่งซื้อ' },
    ],
    defaultTemplate: {
      ...DEFAULT_EMAIL_MASTER_TEMPLATE,
      subject: '[TICKET] แจ้งเตือน: อีก 2 วันพบกันที่ {{concert_name}}',
      preheader: 'เตรียมตัวให้พร้อมสำหรับ {{concert_name}} ณ {{location}} วันที่ {{session_date}}',
      headerTitle: 'TICKET - เตรียมตัวก่อนถึงวันงานคอนเสิร์ต',
      greetingText: 'เรียนคุณ {{buyer_name}},',
      bodyText:
        'การแสดง {{concert_name}} กำลังจะเริ่มต้นขึ้นในอีกไม่ช้า! กรุณาตรวจสอบข้อมูลรอบการแสดง เวลาเปิดประตู และเตรียมบัตร QR Code ของท่านให้พร้อมสำหรับการสแกนเข้างาน',
      showConcertPoster: true,
      showTicketCard: false,
      primaryButtonText: 'เปิดแสดง QR Code บัตรสำหรับเข้างาน',
      primaryButtonUrl: '/orders/{{order_id}}/success?tab=tickets',
      footerNotes:
        'ประตูเปิดเวลา {{door_time}} น. การแสดงเริ่มเวลา {{show_time}} น. กรุณาเผื่อเวลาสำหรับการเดินทางและการตรวจสัมภาระหน้าประตูทางเข้า',
    },
    sampleData: {
      concert_name: 'TICKET FESTIVAL 2026: LIVE IN BANGKOK',
      buyer_name: 'คุณพงศธร รักดนตรี',
      session_date: '15 ธ.ค. 2026',
      door_time: '17:00',
      show_time: '19:00',
      location: 'อิมแพ็ค อารีน่า เมืองทองธานี',
      order_id: 'ORD-20261123-9081',
    },
  },

  refund_approved: {
    id: 'refund_approved',
    category: 'finance',
    name: 'แจ้งผลอนุมัติการคืนเงินและสลิปหลักฐาน',
    shortLabel: 'อนุมัติคืนเงิน',
    description: 'ส่งแจ้งลูกค้าเมื่อแอดมินอนุมัติคำขอคืนเงินและดำเนินการโอนเงินคืนเข้าบัญชีสำเร็จแล้ว',
    mergeTags: [
      { tag: '{{order_id}}', label: 'รหัสคำสั่งซื้อ' },
      { tag: '{{buyer_name}}', label: 'ชื่อผู้ซื้อ' },
      { tag: '{{refund_amount}}', label: 'ยอดเงินคืน (บาท)' },
      { tag: '{{bank_name}}', label: 'ธนาคารปลายทาง' },
      { tag: '{{account_suffix}}', label: 'เลขบัญชีลงท้าย' },
      { tag: '{{transferred_at}}', label: 'วันเวลาที่โอน' },
    ],
    defaultTemplate: {
      ...DEFAULT_EMAIL_MASTER_TEMPLATE,
      subject: '[TICKET] แจ้งผลการโอนเงินคืนสำเร็จ - คำสั่งซื้อ {{order_id}}',
      preheader: 'ระบบได้ดำเนินการโอนเงินคืนจำนวน {{refund_amount}} บาท เข้าบัญชีของท่านเรียบร้อยแล้ว',
      headerTitle: 'TICKET - แจ้งผลการคืนเงิน',
      greetingText: 'เรียนคุณ {{buyer_name}},',
      bodyText:
        'ตามที่ท่านได้ยื่นคำขอคืนเงินสำหรับคำสั่งซื้อ {{order_id}} ทีมงานได้ตรวจสอบและดำเนินการโอนเงินคืนเข้าบัญชีธนาคารของท่านเรียบร้อยแล้ว รายละเอียดการโอนเงินมีดังนี้:',
      showConcertPoster: false,
      showTicketCard: false,
      primaryButtonText: 'ตรวจสอบประวัติคำสั่งซื้อและการคืนเงิน',
      primaryButtonUrl: '/orders/{{order_id}}/refund',
      footerNotes:
        'ยอดเงินจะเข้าบัญชีปลายทางตามรอบระยะเวลาทำการของแต่ละธนาคาร หากมีข้อสงสัยโปรดติดต่อฝ่ายบริการลูกค้าพร้อมแจ้งหมายเลขคำสั่งซื้อ',
    },
    sampleData: {
      order_id: 'ORD-20261123-9081',
      buyer_name: 'คุณพงศธร รักดนตรี',
      refund_amount: '3,500.00',
      bank_name: 'ธนาคารกสิกรไทย (KBANK)',
      account_suffix: 'xxx-x-xx189-2',
      transferred_at: '24 พ.ย. 2026 14:30 น.',
    },
  },

  refund_rejected: {
    id: 'refund_rejected',
    category: 'finance',
    name: 'แจ้งปฏิเสธคำขอคืนเงิน',
    shortLabel: 'ปฏิเสธคืนเงิน',
    description: 'ส่งแจ้งลูกค้าเมื่อคำขอคืนเงินไม่ผ่านเกณฑ์การพิจารณา พร้อมยืนยันสิทธิ์บัตรที่ยังคงสมบูรณ์',
    mergeTags: [
      { tag: '{{order_id}}', label: 'รหัสคำสั่งซื้อ' },
      { tag: '{{buyer_name}}', label: 'ชื่อผู้ซื้อ' },
      { tag: '{{concert_name}}', label: 'ชื่อคอนเสิร์ต' },
      { tag: '{{reject_reason}}', label: 'เหตุผลการปฏิเสธ' },
    ],
    defaultTemplate: {
      ...DEFAULT_EMAIL_MASTER_TEMPLATE,
      subject: '[TICKET] ผลการพิจารณาคำขอคืนเงิน - คำสั่งซื้อ {{order_id}}',
      preheader: 'ผลการพิจารณาคำขอคืนเงินสำหรับคำสั่งซื้อ {{order_id}}',
      headerTitle: 'TICKET - ผลการพิจารณาคำขอคืนเงิน',
      greetingText: 'เรียนคุณ {{buyer_name}},',
      bodyText:
        'ตามที่ท่านได้ยื่นคำขอคืนเงินสำหรับคำสั่งซื้อ {{order_id}} ทีมงานได้ตรวจสอบคำขอของท่านแล้ว ขอเรียนแจ้งว่าไม่สามารถอนุมัติการคืนเงินในครั้งนี้ได้ เนื่องจากเหตุผลดังต่อไปนี้:',
      showConcertPoster: false,
      showTicketCard: false,
      primaryButtonText: 'เปิดดูบัตรคอนเสิร์ตของฉัน',
      primaryButtonUrl: '/orders/{{order_id}}/success?tab=tickets',
      footerNotes:
        'ทั้งนี้ บัตรคอนเสิร์ตในคำสั่งซื้อของท่านยังคงมีผลสมบูรณ์และสามารถนำไปใช้เข้าชมการแสดงได้ตามปกติ ท่านสามารถติดต่อฝ่ายบริการลูกค้าหากต้องการข้อมูลเพิ่มเติม',
    },
    sampleData: {
      order_id: 'ORD-20261123-9081',
      buyer_name: 'คุณพงศธร รักดนตรี',
      concert_name: 'TICKET FESTIVAL 2026: LIVE IN BANGKOK',
      reject_reason: 'การยื่นคำขอนอกระยะเวลาที่กำหนดตามนโยบายของผู้จัดงาน (ยื่นคำขอน้อยกว่า 168 ชั่วโมงก่อนวันจัดแสดง)',
    },
  },

  ticket_revoked: {
    id: 'ticket_revoked',
    category: 'finance',
    name: 'แจ้งเพิกถอนสิทธิ์ / ยกเลิกบัตร',
    shortLabel: 'เพิกถอนสิทธิ์บัตร',
    description: 'ส่งแจ้งลูกค้าเมื่อบัตรถูกยกเลิกสิทธิ์เนื่องจากตรวจพบปัญหาหรือมีการทุจริต',
    mergeTags: [
      { tag: '{{concert_name}}', label: 'ชื่อคอนเสิร์ต' },
      { tag: '{{buyer_name}}', label: 'ชื่อผู้ซื้อ' },
      { tag: '{{ticket_codes}}', label: 'รหัสบัตรที่ถูกยกเลิก' },
      { tag: '{{revoke_reason}}', label: 'เหตุผลการเพิกถอน' },
    ],
    defaultTemplate: {
      ...DEFAULT_EMAIL_MASTER_TEMPLATE,
      subject: '[TICKET] แจ้งการเพิกถอนสิทธิ์บัตรคอนเสิร์ต {{concert_name}}',
      preheader: 'ระบบได้ทำการเพิกถอนสิทธิ์บัตรคอนเสิร์ตของท่าน กรุณาตรวจสอบรายละเอียด',
      headerTitle: 'TICKET - แจ้งการเพิกถอนสิทธิ์บัตรคอนเสิร์ต',
      greetingText: 'เรียนคุณ {{buyer_name}},',
      bodyText:
        'ขอเรียนแจ้งให้ทราบว่า บัตรคอนเสิร์ต {{concert_name}} ของท่านได้ถูกเพิกถอนสิทธิ์ในการเข้าชมการแสดงเรียบร้อยแล้ว โดยมีรายละเอียดเหตุผลดังต่อไปนี้:',
      showConcertPoster: false,
      showTicketCard: false,
      primaryButtonText: 'ติดต่อฝ่ายบริการลูกค้า',
      primaryButtonUrl: '/contact',
      footerNotes:
        'รหัส QR Code เดิมของบัตรที่ถูกเพิกถอนจะไม่สามารถนำมาสแกนผ่านประตูทางเข้าได้อีกต่อไป หากท่านเชื่อว่าเกิดข้อผิดพลาด โปรดติดต่อฝ่ายบริการลูกค้าทันที',
    },
    sampleData: {
      concert_name: 'TICKET FESTIVAL 2026: LIVE IN BANGKOK',
      buyer_name: 'คุณพงศธร รักดนตรี',
      ticket_codes: 'TK-202611-0088-01, TK-202611-0088-02',
      revoke_reason: 'การยกเลิกคำสั่งซื้อเนื่องจากสลิปการโอนเงินไม่ตรงกับยอดที่เรียกเก็บ',
    },
  },

  event_rescheduled: {
    id: 'event_rescheduled',
    category: 'finance',
    name: 'แจ้งเลื่อนรอบการแสดง หรือยกเลิกคอนเสิร์ต',
    shortLabel: 'เลื่อน/ยกเลิกคอนเสิร์ต',
    description: 'ส่งแจ้งผู้ซื้อบัตรทุกคนเมื่อผู้จัดงานประกาศเลื่อนวันแสดงหรือยกเลิกการจัดคอนเสิร์ต',
    mergeTags: [
      { tag: '{{concert_name}}', label: 'ชื่อคอนเสิร์ต' },
      { tag: '{{buyer_name}}', label: 'ชื่อผู้ซื้อ' },
      { tag: '{{old_date}}', label: 'กำหนดการเดิม' },
      { tag: '{{new_date}}', label: 'กำหนดการใหม่' },
      { tag: '{{refund_deadline}}', label: 'กำหนดเวลายื่นขอคืนเงิน' },
    ],
    defaultTemplate: {
      ...DEFAULT_EMAIL_MASTER_TEMPLATE,
      subject: '[สำคัญ] แจ้งการเลื่อนกำหนดการแสดงคอนเสิร์ต {{concert_name}}',
      preheader: 'ประกาศสำคัญจากผู้จัดงานเกี่ยวกับการเลื่อนวันจัดแสดง {{concert_name}}',
      headerTitle: 'TICKET - ประกาศการเปลี่ยนแปลงกำหนดการแสดง',
      greetingText: 'เรียนคุณ {{buyer_name}},',
      bodyText:
        'ผู้จัดงานคอนเสิร์ต {{concert_name}} ขอเรียนแจ้งการเปลี่ยนแปลงกำหนดการจัดแสดงอันเนื่องมาจากเหตุสุดวิสัย โดยมีรายละเอียดกำหนดการใหม่และการดูแลผู้ถือบัตรดังนี้:',
      showConcertPoster: true,
      showTicketCard: false,
      primaryButtonText: 'เลือกการใช้สิทธิ์หรือขอรับเงินคืน',
      primaryButtonUrl: '/my-tickets',
      footerNotes:
        'ผู้ถือบัตรสามารถใช้บัตรเดิมเข้าชมการแสดงในรอบใหม่ได้ทันที หรือหากไม่สะดวกสามารถยื่นความประสงค์ขอรับเงินคืนเต็มจำนวนได้ภายในวันที่ {{refund_deadline}}',
    },
    sampleData: {
      concert_name: 'TICKET FESTIVAL 2026: LIVE IN BANGKOK',
      buyer_name: 'คุณพงศธร รักดนตรี',
      old_date: '15 ธันวาคม 2026 เวลา 19:00 น.',
      new_date: '25 มกราคม 2027 เวลา 19:00 น.',
      refund_deadline: '15 มกราคม 2027 เวลา 23:59 น.',
    },
  },

  direct_ticket: {
    id: 'direct_ticket',
    category: 'staff',
    name: 'ส่งมอบบัตรตรง / โควตา VIP จากผู้จัดงาน',
    shortLabel: 'ออกบัตรตรง VIP',
    description: 'ส่งมอบบัตรคอนเสิร์ตให้แขกพิเศษ สปอนเซอร์ หรือผู้รับมอบบัตรโดยตรงจากผู้จัดงาน',
    mergeTags: [
      { tag: '{{concert_name}}', label: 'ชื่อคอนเสิร์ต' },
      { tag: '{{recipient_name}}', label: 'ชื่อผู้รับมอบ' },
      { tag: '{{ticket_code}}', label: 'รหัสบัตร' },
      { tag: '{{reference_note}}', label: 'หมายเหตุอ้างอิง/โควตา' },
      { tag: '{{session_date}}', label: 'วันที่จัดแสดง' },
    ],
    defaultTemplate: {
      ...DEFAULT_EMAIL_MASTER_TEMPLATE,
      subject: '[TICKET] มอบบัตรคอนเสิร์ต {{concert_name}} - สำหรับแขกพิเศษ (VIP Ticket)',
      preheader: 'ท่านได้รับมอบบัตรคอนเสิร์ต {{concert_name}} จากผู้จัดงานเรียบร้อยแล้ว',
      headerTitle: 'TICKET - บัตรคอนเสิร์ตสำหรับเข้างาน (ออกบัตรตรง)',
      greetingText: 'เรียนคุณ {{recipient_name}},',
      bodyText:
        'ผู้จัดงานมีความยินดีมอบบัตรคอนเสิร์ต {{concert_name}} ให้แก่ท่านเพื่อเข้าชมการแสดงตามรายละเอียดด้านล่างนี้ กรุณาบันทึกภาพบัตรและ QR Code เพื่อนำมาแสดง ณ จุดลงทะเบียนเข้างาน:',
      showConcertPoster: false,
      showTicketCard: true,
      primaryButtonText: 'เปิดดูและบันทึกบัตรคอนเสิร์ต',
      primaryButtonUrl: '/direct-tickets/view',
      footerNotes:
        'บัตรนี้เป็นสิทธิ์เฉพาะบุคคล ห้ามนำไปจำหน่ายต่อ กรุณาแสดง QR Code ต่อเจ้าหน้าที่ลงทะเบียนในวันจัดงาน',
    },
    sampleData: {
      concert_name: 'TICKET FESTIVAL 2026: LIVE IN BANGKOK',
      recipient_name: 'คุณพงศธร รักดนตรี (VIP Guest)',
      ticket_code: 'TK-DIR-202611-VIP01',
      reference_note: 'โควตาแขกพิเศษผู้สนับสนุนหลัก (Official Sponsor Quota)',
      session_date: '15 ธ.ค. 2026',
    },
  },

  organizer_payout: {
    id: 'organizer_payout',
    category: 'staff',
    name: 'แจ้งสรุปการโอนเงินส่วนแบ่งรายได้ให้ผู้จัดงาน',
    shortLabel: 'สรุปรายได้ผู้จัดงาน',
    description: 'ส่งแจ้งสรุปยอดเงินรายได้จากการขายบัตรประจำสัปดาห์ พร้อมหลักฐานการโอนเงินให้ผู้จัดงาน',
    mergeTags: [
      { tag: '{{concert_name}}', label: 'ชื่อคอนเสิร์ต' },
      { tag: '{{organizer_name}}', label: 'ชื่อผู้จัดงาน' },
      { tag: '{{gross_sales}}', label: 'ยอดขายรวม (บาท)' },
      { tag: '{{platform_fee}}', label: 'ค่าธรรมเนียมแพลตฟอร์ม (บาท)' },
      { tag: '{{net_payout}}', label: 'ยอดโอนสุทธิ (บาท)' },
      { tag: '{{period}}', label: 'รอบระยะเวลาคำนวณ' },
    ],
    defaultTemplate: {
      ...DEFAULT_EMAIL_MASTER_TEMPLATE,
      subject: '[TICKET] สรุปการโอนเงินรายได้การจำหน่ายบัตร - {{concert_name}}',
      preheader: 'ระบบได้ดำเนินการโอนเงินส่วนแบ่งรายได้สุทธิจำนวน {{net_payout}} บาท ให้แก่ผู้จัดงานแล้ว',
      headerTitle: 'TICKET - สรุปการโอนเงินส่วนแบ่งรายได้ผู้จัดงาน',
      greetingText: 'เรียน {{organizer_name}},',
      bodyText:
        'ระบบ TICKET ได้ทำการสรุปยอดและดำเนินการโอนเงินส่วนแบ่งรายได้จากการจำหน่ายบัตรคอนเสิร์ต {{concert_name}} ประจำรอบ {{period}} เรียบร้อยแล้ว รายละเอียดการโอนเงินมีดังนี้:',
      showConcertPoster: false,
      showTicketCard: false,
      primaryButtonText: 'เข้าสู่ระบบเพื่อดูรายงานการเงินฉบับเต็ม',
      primaryButtonUrl: '/back-office/organizer/settlement',
      footerNotes:
        'รายงานการเงินและใบเสร็จค่าธรรมเนียมสามารถดาวน์โหลดได้ผ่านเมนูการเงินในระบบหลังบ้าน หากมีข้อสงสัยโปรดติดต่อฝ่ายประสานงานผู้จัด',
    },
    sampleData: {
      concert_name: 'TICKET FESTIVAL 2026: LIVE IN BANGKOK',
      organizer_name: 'บริษัท บันเทิงไทย โปรดักชั่น จำกัด',
      gross_sales: '450,000.00',
      platform_fee: '22,500.00',
      net_payout: '427,500.00',
      period: 'สัปดาห์ที่ 3 (17-23 พ.ย. 2026)',
    },
  },

  staff_invitation: {
    id: 'staff_invitation',
    category: 'staff',
    name: 'คำเชิญเข้าร่วมเป็นทีมงานในระบบ TICKET',
    shortLabel: 'คำเชิญทีมงาน',
    description: 'ส่งคำเชิญให้เจ้าหน้าที่ใหม่ (แอดมิน, ผู้ช่วยจัดงาน, เจ้าหน้าที่สแกนบัตร) เพื่อตั้งรหัสผ่านเข้าใช้งาน',
    mergeTags: [
      { tag: '{{role_thai}}', label: 'บทบาทหน้าที่' },
      { tag: '{{concert_name}}', label: 'ชื่อคอนเสิร์ต' },
      { tag: '{{inviter_name}}', label: 'ชื่อผู้เชิญ' },
      { tag: '{{expire_hours}}', label: 'อายุคำเชิญ (ชม.)' },
    ],
    defaultTemplate: {
      ...DEFAULT_EMAIL_MASTER_TEMPLATE,
      subject: '[TICKET] คำเชิญเข้าร่วมเป็น{{role_thai}}ในระบบ TICKET',
      preheader: 'ท่านได้รับคำเชิญเข้าร่วมทีมงานสำหรับคอนเสิร์ต {{concert_name}}',
      headerTitle: 'TICKET - คำเชิญเข้าร่วมเป็นทีมงาน',
      greetingText: 'เรียน เจ้าหน้าที่ผู้ร่วมงาน,',
      bodyText:
        'ท่านได้รับคำเชิญจาก {{inviter_name}} เพื่อเข้าร่วมปฏิบัติหน้าที่ในบทบาท "{{role_thai}}" สำหรับการจัดงานคอนเสิร์ต {{concert_name}} กรุณากดปุ่มด้านล่างเพื่อยอมรับคำเชิญและตั้งรหัสผ่านเข้าสู่ระบบ:',
      showConcertPoster: false,
      showTicketCard: false,
      primaryButtonText: 'ยอมรับคำเชิญและตั้งรหัสผ่าน',
      primaryButtonUrl: '/invitations/accept?token=sample_invite',
      footerNotes:
        'ลิงก์คำเชิญนี้มีอายุการใช้งาน {{expire_hours}} ชั่วโมงและใช้งานได้เพียงครั้งเดียว หากท่านไม่ได้มีส่วนเกี่ยวข้องกับกิจกรรมนี้ โปรดติดต่อผู้ดูแลระบบ',
    },
    sampleData: {
      role_thai: 'เจ้าหน้าที่สแกนบัตรหน้าประตู (Gate Scanner)',
      concert_name: 'TICKET FESTIVAL 2026: LIVE IN BANGKOK',
      inviter_name: 'คุณสมศักดิ์ ผู้จัดการฝ่ายปฏิบัติการ',
      expire_hours: '48',
    },
  },

  password_reset: {
    id: 'password_reset',
    category: 'staff',
    name: 'ตั้งรหัสผ่านใหม่สำหรับทีมงานหลังบ้าน',
    shortLabel: 'รีเซ็ตรหัสผ่าน',
    description: 'ส่งลิงก์ตั้งรหัสผ่านใหม่ให้ทีมงานหลังบ้านเมื่อกดลืมรหัสผ่าน',
    mergeTags: [
      { tag: '{{user_name}}', label: 'ชื่อผู้ใช้งาน' },
      { tag: '{{request_time}}', label: 'วันเวลาที่ร้องขอ' },
      { tag: '{{expire_minutes}}', label: 'เวลาหมดอายุ (นาที)' },
    ],
    defaultTemplate: {
      ...DEFAULT_EMAIL_MASTER_TEMPLATE,
      subject: '[TICKET] คำขอตั้งรหัสผ่านใหม่สำหรับบัญชีระบบหลังบ้าน',
      preheader: 'ท่านได้ทำรายการร้องขอตั้งรหัสผ่านใหม่สำหรับบัญชีระบบ TICKET',
      headerTitle: 'TICKET - ตั้งรหัสผ่านใหม่',
      greetingText: 'เรียนคุณ {{user_name}},',
      bodyText:
        'ระบบได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีผู้ใช้งานระบบหลังบ้านของท่าน เมื่อ {{request_time}} หากท่านเป็นผู้ทำรายการ กรุณากดปุ่มด้านล่างนี้เพื่อดำเนินการตั้งรหัสผ่านใหม่:',
      showConcertPoster: false,
      showTicketCard: false,
      primaryButtonText: 'ตั้งรหัสผ่านใหม่',
      primaryButtonUrl: '/back-office/reset-password?token=sample_token',
      footerNotes:
        'ลิงก์นี้มีอายุการใช้งาน {{expire_minutes}} นาทีและใช้ได้เพียงครั้งเดียว หากท่านไม่ได้เป็นผู้ทำรายการ โปรดแจ้งผู้ดูแลระบบความปลอดภัยทันที',
    },
    sampleData: {
      user_name: 'เจ้าหน้าที่ผู้ดูแลระบบ',
      request_time: '24 พ.ย. 2026 15:45 น.',
      expire_minutes: '30',
    },
  },

  support_reply: {
    id: 'support_reply',
    category: 'support',
    name: 'ตอบกลับข้อความสอบถามช่วยเหลือลูกค้า',
    shortLabel: 'ตอบกลับลูกค้า',
    description: 'ส่งตอบกลับลูกค้าเมื่อเจ้าหน้าที่ฝ่ายสนับสนุนลูกค้าตอบข้อความผ่านระบบ Helpdesk',
    mergeTags: [
      { tag: '{{ticket_id}}', label: 'หมายเลขคำร้อง (Ticket ID)' },
      { tag: '{{customer_name}}', label: 'ชื่อลูกค้า' },
      { tag: '{{subject}}', label: 'หัวข้อการสอบถาม' },
      { tag: '{{agent_name}}', label: 'ชื่อเจ้าหน้าที่ผู้ตอบ' },
    ],
    defaultTemplate: {
      ...DEFAULT_EMAIL_MASTER_TEMPLATE,
      subject: '[Ticket #{{ticket_id}}] ตอบกลับข้อสอบถาม: {{subject}}',
      preheader: 'เจ้าหน้าที่ฝ่ายบริการลูกค้าได้ตอบกลับข้อความสอบถามของท่านแล้ว',
      headerTitle: 'TICKET - ฝ่ายบริการลูกค้าสัมพันธ์',
      greetingText: 'เรียนคุณ {{customer_name}},',
      bodyText:
        'ขอขอบคุณที่ติดต่อฝ่ายบริการลูกค้า TICKET เกี่ยวกับข้อสอบถามหมายเลข #{{ticket_id}} เจ้าหน้าที่ขอเรียนชี้แจงและให้ข้อมูลเพิ่มเติมดังนี้:',
      showConcertPoster: false,
      showTicketCard: false,
      primaryButtonText: 'ดูประวัติการสนทนาบนเว็บไซต์',
      primaryButtonUrl: '/support/tickets/{{ticket_id}}',
      footerNotes:
        'ท่านสามารถตอบกลับอีเมลนี้โดยตรงเพื่อพูดคุยกับเจ้าหน้าที่ต่อเนื่อง หรือเข้าสู่เว็บไซต์เพื่อตรวจสอบสถานะคำร้องของท่าน',
    },
    sampleData: {
      ticket_id: 'SUP-202611-8821',
      customer_name: 'คุณพงศธร รักดนตรี',
      subject: 'สอบถามขั้นตอนการสแกนบัตรผ่านประตู',
      agent_name: 'เจ้าหน้าที่สมชาย (Customer Support)',
    },
  },
};

export function getScenarioDefinition(key: EmailScenarioKey): EmailScenarioDefinition {
  return EMAIL_SCENARIOS[key] || EMAIL_SCENARIOS.ticket_delivery;
}

export function getScenariosByCategory(category: EmailScenarioCategory): EmailScenarioDefinition[] {
  return Object.values(EMAIL_SCENARIOS).filter((s) => s.category === category);
}

export interface EmailMasterTemplatePayload {
  template: EmailTemplateState;
  presets?: EmailTemplatePreset[];
  activePresetId?: string;
  scenarioTemplates?: Partial<Record<EmailScenarioKey, EmailTemplateState>>;
  scenarioPresets?: Partial<Record<EmailScenarioKey, EmailTemplatePreset[]>>;
  scenarioActivePresetIds?: Partial<Record<EmailScenarioKey, string>>;
  activeScenario?: EmailScenarioKey;
}

export const INITIAL_EMAIL_PRESETS: EmailTemplatePreset[] = [
  {
    id: 'preset-default-master',
    name: 'เทมเพลตมาตรฐานหลัก (Default Master)',
    description: 'เทมเพลตมาตรฐานของระบบ พร้อมโปสเตอร์และบัตรคอนเสิร์ตจริง',
    template: {
      ...DEFAULT_EMAIL_MASTER_TEMPLATE,
    },
    updatedAt: new Date().toISOString(),
  },
];

export function getDefaultScenarioPresets(scenarioKey: EmailScenarioKey): EmailTemplatePreset[] {
  if (scenarioKey === 'ticket_delivery') {
    return INITIAL_EMAIL_PRESETS;
  }
  const def = EMAIL_SCENARIOS[scenarioKey];
  const shortName = def ? def.name : scenarioKey;
  return [
    {
      id: `preset-default-${scenarioKey}`,
      name: `เทมเพลตมาตรฐาน (${shortName})`,
      description: def ? def.description : 'เทมเพลตมาตรฐานของระบบ',
      template: def ? { ...def.defaultTemplate } : { ...DEFAULT_EMAIL_MASTER_TEMPLATE },
      updatedAt: new Date().toISOString(),
    },
  ];
}

export function parseEmailMasterTemplate(input: unknown): EmailTemplateState | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (typeof data.subject !== 'string' || typeof data.bodyText !== 'string') return null;

  const picked: Partial<EmailTemplateState> = {};
  const allowedKeys = Object.keys(DEFAULT_EMAIL_MASTER_TEMPLATE) as Array<keyof EmailTemplateState>;
  for (const key of allowedKeys) {
    if (key !== 'sectionOrder' && data[key] !== undefined) {
      (picked as Record<string, unknown>)[key] = data[key];
    }
  }

  return {
    ...DEFAULT_EMAIL_MASTER_TEMPLATE,
    ...picked,
    sectionOrder: normalizeEmailSectionOrder(data.sectionOrder, data.layoutOrder),
  };
}

export function parseEmailMasterPayload(input: unknown): EmailMasterTemplatePayload | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;

  // Direct template or wrapped in payload
  const rawTemplate = (data.template && typeof data.template === 'object') ? data.template : data;
  const template = parseEmailMasterTemplate(rawTemplate);
  if (!template) return null;

  let presets: EmailTemplatePreset[] = INITIAL_EMAIL_PRESETS;
  if (Array.isArray(data.presets)) {
    const validPresets = data.presets
      .map((p: unknown) => {
        if (!p || typeof p !== 'object') return null;
        const pr = p as Record<string, unknown>;
        const parsedT = parseEmailMasterTemplate(pr.template);
        if (!parsedT || typeof pr.id !== 'string' || typeof pr.name !== 'string') return null;
        return {
          id: pr.id,
          name: pr.name,
          description: typeof pr.description === 'string' ? pr.description : undefined,
          template: parsedT,
          updatedAt: typeof pr.updatedAt === 'string' ? pr.updatedAt : new Date().toISOString(),
        } as EmailTemplatePreset;
      })
      .filter((p): p is EmailTemplatePreset => p !== null);

    if (validPresets.length > 0) {
      presets = validPresets;
    }
  }

  const activePresetId = typeof data.activePresetId === 'string' ? data.activePresetId : presets[0]?.id;

  // Parse scenario templates if present
  let scenarioTemplates: Partial<Record<EmailScenarioKey, EmailTemplateState>> | undefined;
  if (data.scenarioTemplates && typeof data.scenarioTemplates === 'object' && !Array.isArray(data.scenarioTemplates)) {
    scenarioTemplates = {};
    const rawScenarios = data.scenarioTemplates as Record<string, unknown>;
    for (const key of Object.keys(EMAIL_SCENARIOS) as EmailScenarioKey[]) {
      if (rawScenarios[key]) {
        const parsed = parseEmailMasterTemplate(rawScenarios[key]);
        if (parsed) {
          scenarioTemplates[key] = parsed;
        }
      }
    }
  }

  // Parse scenario presets if present
  let scenarioPresets: Partial<Record<EmailScenarioKey, EmailTemplatePreset[]>> | undefined;
  if (data.scenarioPresets && typeof data.scenarioPresets === 'object' && !Array.isArray(data.scenarioPresets)) {
    scenarioPresets = {};
    const rawScenarioPresets = data.scenarioPresets as Record<string, unknown>;
    for (const key of Object.keys(EMAIL_SCENARIOS) as EmailScenarioKey[]) {
      if (Array.isArray(rawScenarioPresets[key])) {
        const validList = (rawScenarioPresets[key] as unknown[])
          .map((p: unknown) => {
            if (!p || typeof p !== 'object') return null;
            const pr = p as Record<string, unknown>;
            const parsedT = parseEmailMasterTemplate(pr.template);
            if (!parsedT || typeof pr.id !== 'string' || typeof pr.name !== 'string') return null;
            return {
              id: pr.id,
              name: pr.name,
              description: typeof pr.description === 'string' ? pr.description : undefined,
              template: parsedT,
              updatedAt: typeof pr.updatedAt === 'string' ? pr.updatedAt : new Date().toISOString(),
            } as EmailTemplatePreset;
          })
          .filter((p): p is EmailTemplatePreset => p !== null);
        if (validList.length > 0) {
          scenarioPresets[key] = validList;
        }
      }
    }
  }

  // Parse scenario active preset IDs if present
  let scenarioActivePresetIds: Partial<Record<EmailScenarioKey, string>> | undefined;
  if (data.scenarioActivePresetIds && typeof data.scenarioActivePresetIds === 'object' && !Array.isArray(data.scenarioActivePresetIds)) {
    scenarioActivePresetIds = {};
    const rawActiveIds = data.scenarioActivePresetIds as Record<string, unknown>;
    for (const key of Object.keys(EMAIL_SCENARIOS) as EmailScenarioKey[]) {
      if (typeof rawActiveIds[key] === 'string') {
        scenarioActivePresetIds[key] = rawActiveIds[key] as string;
      }
    }
  }

  // Backwards compatibility sync for ticket_delivery:
  if (!scenarioPresets) {
    scenarioPresets = {};
  }
  if (!scenarioPresets.ticket_delivery && presets.length > 0) {
    scenarioPresets.ticket_delivery = presets;
  }
  if (!scenarioActivePresetIds) {
    scenarioActivePresetIds = {};
  }
  if (!scenarioActivePresetIds.ticket_delivery && activePresetId) {
    scenarioActivePresetIds.ticket_delivery = activePresetId;
  }

  const activeScenario =
    typeof data.activeScenario === 'string' && data.activeScenario in EMAIL_SCENARIOS
      ? (data.activeScenario as EmailScenarioKey)
      : undefined;

  return {
    template,
    presets,
    activePresetId,
    scenarioTemplates,
    scenarioPresets,
    scenarioActivePresetIds,
    activeScenario,
  };
}

/**
 * Replaces merge tags like {{concert_name}}, {{buyer_name}}, etc. in a text string.
 */
export function interpolateEmailVariables(
  text: string,
  variables: Record<string, string | number>,
): string {
  let result = text;
  for (const [key, val] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, String(val));
  }
  return result;
}
