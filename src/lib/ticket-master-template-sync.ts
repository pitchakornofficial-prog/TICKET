// Master Ticket Template Synchronization and Types (D-275)

export type ElementSection = 'header' | 'event' | 'access' | 'schedule' | 'security' | 'footer' | 'stub';

export interface MovableItem {
  id: string;
  label: string;
  section: ElementSection;
  x: number;
  y: number;
  visible: boolean;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  secondaryColor?: string;
  bgColor?: string;
  borderColor?: string;
  borderWidth?: number;
  text?: string;
  secondaryText?: string;
  size?: number;
}

export interface WorkspaceStageSettings {
  style: 'dots' | 'grid' | 'stripes' | 'slate' | 'wood' | 'studio' | 'clean';
  customColor: string;
}

export interface TicketDesignerState {
  presetId: string;
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  tearLineX: number;
  tearLineStyle: 'dashed' | 'dotted' | 'solid' | 'none';
  tearLineColor: string;
  fontFamily: string;
  bgType: 'solid' | 'gradient' | 'image';
  bgColor: string;
  gradientStart: string;
  gradientEnd: string;
  gradientAngle: number;
  gradientType: 'linear' | 'radial';
  patternType: 'none' | 'dots' | 'grid' | 'stripes';
  bgImageUrl: string;
  bgOverlayDarkness: number;
  bgOverlayBlur: number;
  qrFgColor: string;
  qrBgColor: string;
  qrPayload: string;
  qrSize: number;
  elements: Record<string, MovableItem>;
}

export const MASTER_TEMPLATE_STORAGE_KEY = 'ticket_master_template_v1';
export const EVENT_MASTER_TEMPLATE_CHANGED = 'ticket_master_template_updated';
export const CHANNEL_MASTER_TEMPLATE = 'ticket_master_template_channel';

export const DEFAULT_WORKSPACE_STAGE: WorkspaceStageSettings = {
  style: 'dots',
  customColor: '#f8fafc',
};

export const DEFAULT_STATE: TicketDesignerState = {
  presetId: 'classic-white',
  borderRadius: 4,
  borderWidth: 1,
  borderColor: '#cbd5e1',
  tearLineX: 720,
  tearLineStyle: 'dashed',
  tearLineColor: '#94a3b8',

  fontFamily: 'Kanit',

  bgType: 'solid',
  bgColor: '#ffffff',
  gradientStart: '#1e293b',
  gradientEnd: '#0f172a',
  gradientAngle: 135,
  gradientType: 'linear',
  patternType: 'none',
  bgImageUrl: '',
  bgOverlayDarkness: 0,
  bgOverlayBlur: 0,

  qrFgColor: '#000000',
  qrBgColor: '#ffffff',
  qrPayload: 'TK-849201-9482-01',
  qrSize: 155,

  elements: {
    // 1. Header & Platform Branding
    brandLogo: {
      id: 'brandLogo',
      label: 'โลโก้ TICKET และประเภทบัตร (Header & Branding)',
      section: 'header',
      x: 36,
      y: 26,
      visible: true,
      color: '#0f172a',
      secondaryColor: '#64748b',
      text: 'TICKET',
      secondaryText: 'OFFICIAL CONCERT PASS',
    },

    // 2. Event Identity Section
    eventTitle: {
      id: 'eventTitle',
      label: 'ชื่อคอนเสิร์ต (Event Title)',
      section: 'event',
      x: 36,
      y: 68,
      visible: true,
      fontSize: 26,
      fontWeight: '700',
      color: '#0f172a',
      text: 'Isan Indy Rock Fest 2026',
    },
    zoneBadge: {
      id: 'zoneBadge',
      label: 'ป้ายโซน / ประเภทบัตร (Zone & Category)',
      section: 'event',
      x: 36,
      y: 112,
      visible: true,
      fontSize: 13,
      fontWeight: '700',
      color: '#ffffff',
      bgColor: '#0f172a',
      borderColor: 'transparent',
      borderWidth: 0,
      text: 'VIP FRONT ROW - ZONE A',
    },

    // 3. Admission, Seating & Price Grid
    gateInfo: {
      id: 'gateInfo',
      label: 'ประตูทางเข้า (Gate)',
      section: 'access',
      x: 36,
      y: 162,
      visible: true,
      fontSize: 16,
      fontWeight: '700',
      color: '#0f172a',
      secondaryColor: '#64748b',
      secondaryText: 'ประตูทางเข้า (GATE)',
      text: 'GATE 2',
    },
    seatInfo: {
      id: 'seatInfo',
      label: 'แถว / ที่นั่ง (Seat / Row)',
      section: 'access',
      x: 180,
      y: 162,
      visible: true,
      fontSize: 16,
      fontWeight: '700',
      color: '#0f172a',
      secondaryColor: '#64748b',
      secondaryText: 'แถว/ที่นั่ง (ROW / SEAT)',
      text: 'แถว A / ที่นั่ง 14',
    },
    priceInfo: {
      id: 'priceInfo',
      label: 'ราคาบัตร (Price)',
      section: 'access',
      x: 360,
      y: 162,
      visible: true,
      fontSize: 16,
      fontWeight: '700',
      color: '#0f172a',
      secondaryColor: '#64748b',
      secondaryText: 'ราคาบัตร (PRICE)',
      text: 'THB 3,500',
    },

    // 4. Schedule & Venue Section
    dateTime: {
      id: 'dateTime',
      label: 'วันและเวลาแสดง (Date & Time)',
      section: 'schedule',
      x: 36,
      y: 228,
      visible: true,
      fontSize: 14,
      color: '#0f172a',
      secondaryColor: '#64748b',
      text: '24 ธันวาคม 2026 | ประตูเปิด 17:00 น. | เริ่มแสดง 19:00 น.',
      secondaryText: 'วันและเวลาแสดง (DATE & TIME)',
    },
    venue: {
      id: 'venue',
      label: 'สถานที่จัดงาน (Venue & Hall)',
      section: 'schedule',
      x: 36,
      y: 284,
      visible: true,
      fontSize: 14,
      color: '#0f172a',
      secondaryColor: '#64748b',
      text: 'ศูนย์ประชุมและแสดงสินค้านานาชาติ เชียงใหม่ (Hall 1)',
      secondaryText: 'สถานที่จัดงาน (VENUE & HALL)',
    },

    // 5. Attendee & Security Barcode Section
    buyerName: {
      id: 'buyerName',
      label: 'ชื่อผู้ถือบัตร (Attendee)',
      section: 'security',
      x: 36,
      y: 338,
      visible: true,
      fontSize: 13,
      color: '#0f172a',
      secondaryColor: '#64748b',
      text: 'สมชาย รักดนตรี',
      secondaryText: 'ผู้ถือบัตร (ATTENDEE)',
    },
    ticketCode: {
      id: 'ticketCode',
      label: 'รหัสบัตรเฉพาะใบ (Ticket Code)',
      section: 'security',
      x: 210,
      y: 338,
      visible: true,
      fontSize: 14,
      fontWeight: '700',
      color: '#0f172a',
      secondaryColor: '#64748b',
      text: 'TK-849201-9482-01',
      secondaryText: 'รหัสบัตร (TICKET CODE)',
    },
    barcode: {
      id: 'barcode',
      label: 'แถบบาร์โค้ดความปลอดภัย (Security Barcode)',
      section: 'security',
      x: 430,
      y: 332,
      visible: true,
      text: 'TK-849201-9482-01',
      secondaryText: 'SECURITY VERIFICATION',
      color: '#0f172a',
      secondaryColor: '#64748b',
    },

    // 6. Footer Terms & Policy Section
    footerNote: {
      id: 'footerNote',
      label: 'เงื่อนไขและข้อตกลงท้ายบัตร (Footer Policy)',
      section: 'footer',
      x: 36,
      y: 394,
      visible: true,
      fontSize: 11,
      color: '#64748b',
      text: '* บัตรนี้สามารถสแกนเข้างานได้ 1 ครั้งต่อท่าน · ห้ามทำซ้ำหรือดัดแปลง · แสดงพร้อมบัตรประชาชน',
    },

    // 7. Admission Stub (หางบัตรตรวจเข้างาน)
    stubEventSummary: {
      id: 'stubEventSummary',
      label: 'สรุปชื่องานบนหางบัตร (Stub Summary)',
      section: 'stub',
      x: 745,
      y: 24,
      visible: true,
      fontSize: 12,
      fontWeight: '700',
      color: '#0f172a',
      secondaryColor: '#64748b',
      secondaryText: 'ADMISSION STUB',
      text: 'ISAN ROCK 2026 · VIP ZONE A',
    },
    qrCode: {
      id: 'qrCode',
      label: 'คิวอาร์โค้ดสแกนเข้างาน (Gate QR)',
      section: 'stub',
      x: 765,
      y: 68,
      visible: true,
      size: 155,
    },
    qrCodeLabel: {
      id: 'qrCodeLabel',
      label: 'รหัสบัตรบนหางบัตร (Stub Ticket Code)',
      section: 'stub',
      x: 755,
      y: 242,
      visible: true,
      fontSize: 13,
      fontWeight: '700',
      color: '#0f172a',
      secondaryColor: '#64748b',
      text: 'TK-849201-9482-01',
      secondaryText: 'รหัสอ้างอิงบัตร (TICKET CODE)',
    },
    scanHint: {
      id: 'scanHint',
      label: 'คำแนะนำการสแกน (Scan Instruction)',
      section: 'stub',
      x: 745,
      y: 300,
      visible: true,
      fontSize: 11,
      color: '#64748b',
      text: 'แสดง QR Code ต่อเจ้าหน้าที่เพื่อสแกนเข้างาน',
    },
    orderId: {
      id: 'orderId',
      label: 'หมายเลขคำสั่งซื้อ (Order ID)',
      section: 'stub',
      x: 745,
      y: 345,
      visible: true,
      fontSize: 11,
      color: '#64748b',
      secondaryColor: '#64748b',
      text: 'ORD-20261224-8891',
      secondaryText: 'หมายเลขคำสั่งซื้อ (ORDER ID)',
    },
  },
};

/**
 * Loads the active master ticket template from localStorage or fallback to DEFAULT_STATE.
 */
export function loadLocalMasterTemplate(): TicketDesignerState {
  if (typeof window === 'undefined') {
    return DEFAULT_STATE;
  }
  try {
    const raw = localStorage.getItem(MASTER_TEMPLATE_STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_STATE;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      elements: {
        ...DEFAULT_STATE.elements,
        ...(parsed.elements || {}),
      },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

/**
 * Saves master ticket template to localStorage and broadcasts change events.
 */
export function saveLocalMasterTemplate(template: TicketDesignerState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MASTER_TEMPLATE_STORAGE_KEY, JSON.stringify(template));
    window.dispatchEvent(new CustomEvent(EVENT_MASTER_TEMPLATE_CHANGED, { detail: template }));
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel(CHANNEL_MASTER_TEMPLATE);
        channel.postMessage({ type: 'UPDATE', template });
        channel.close();
      } catch {
        // BroadcastChannel unavailable
      }
    }
  } catch (error) {
    console.warn('Failed to save master ticket template to storage', error);
  }
}

/**
 * Fetches public master ticket template from backend.
 */
export async function loadPublicMasterTemplate(): Promise<TicketDesignerState | null> {
  try {
    const res = await fetch('/api/public/ticket-master-template', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.template || null;
  } catch {
    return null;
  }
}

/**
 * Fetches owner master ticket template from backend.
 */
export async function loadOwnerMasterTemplate(): Promise<TicketDesignerState | null> {
  try {
    const res = await fetch('/api/owner/ticket-master-template', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.template || null;
  } catch {
    return null;
  }
}

/**
 * Saves master ticket template to backend via Owner API and updates local storage.
 */
export async function saveOwnerMasterTemplate(template: TicketDesignerState): Promise<void> {
  const res = await fetch('/api/owner/ticket-master-template', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template }),
  });
  if (!res.ok) {
    throw new Error('บันทึกแบบบัตรหลักไปที่เซิร์ฟเวอร์ไม่สำเร็จ');
  }
  saveLocalMasterTemplate(template);
}
