'use client';

import {
  useState,
  useId,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent,
  type CSSProperties,
} from 'react';
import {
  SparklesIcon,
  DownloadIcon,
  RefreshIcon,
  CheckIcon,
  SlidersIcon,
  EyeIcon,
  EyeOffIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@/components/icons';
import { TicketIcon } from '@/components/ticket-icon';
import { generateCustomQrSvg } from '@/lib/ticket-qr';

export type TearLineStyle = 'dashed' | 'dotted' | 'notched' | 'solid' | 'none';
export type BackgroundType = 'solid' | 'gradient' | 'pattern' | 'image';
export type FontFamilyChoice = 'Kanit' | 'Sarabun' | 'Prompt' | 'Chakra Petch' | 'monospace' | 'sans-serif';
export type ElementSection = 'header' | 'event' | 'access' | 'schedule' | 'security' | 'stub' | 'footer';
export type DesignerTabId = 'elements' | 'cardBg' | 'stageBg' | 'tearLine' | 'allElements';
export type WorkspaceStageStyle = 'dots' | 'white' | 'light-slate' | 'grid' | 'dark-neutral';

export interface WorkspaceStageSettings {
  style: WorkspaceStageStyle;
  customColor: string;
}

export interface MovableItem {
  id: string;
  label: string;
  section: ElementSection;
  x: number;
  y: number;
  visible: boolean;
  fontSize?: number;
  fontWeight?: '600' | '700' | '800';
  color?: string;
  secondaryColor?: string;
  bgColor?: string;
  borderColor?: string;
  borderWidth?: number;
  text?: string;
  secondaryText?: string;
  size?: number; // for QR
}

export interface TicketDesignerState {
  presetId: string;
  // Card Shape & Boundary
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  tearLineX: number; // 550 to 850 px
  tearLineStyle: TearLineStyle;
  tearLineColor: string;

  // Global Typography & Font
  fontFamily: FontFamilyChoice;

  // Background & Testing (Clean Solid or Stage Contrast Testing)
  bgType: BackgroundType;
  bgColor: string;
  gradientStart: string;
  gradientEnd: string;
  gradientAngle: number;
  gradientType: 'linear' | 'radial';
  patternType: 'none' | 'dots' | 'grid' | 'stripes';
  bgImageUrl: string;
  bgOverlayDarkness: number; // 0 to 90%
  bgOverlayBlur: number; // 0 to 12px

  // QR Code Specific
  qrFgColor: string;
  qrBgColor: string;
  qrPayload: string;
  qrSize: number;

  // Movable Elements
  elements: Record<string, MovableItem>;
}

export const MASTER_TEMPLATE_STORAGE_KEY = 'ticket_master_template_v1';

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
      label: 'โซน / ประเภทบัตร (Zone & Category)',
      section: 'event',
      x: 36,
      y: 112,
      visible: true,
      fontSize: 16,
      fontWeight: '700',
      color: '#0f172a',
      secondaryColor: '#64748b',
      secondaryText: 'โซน / ประเภทบัตร (ZONE & CATEGORY)',
      bgColor: 'transparent',
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

const SECTIONS_DIRECTORY: { id: ElementSection; name: string; itemIds: string[] }[] = [
  {
    id: 'header',
    name: '1. ส่วนหัวและแบรนด์',
    itemIds: ['brandLogo'],
  },
  {
    id: 'event',
    name: '2. ข้อมูลคอนเสิร์ตและโซน',
    itemIds: ['eventTitle', 'zoneBadge'],
  },
  {
    id: 'access',
    name: '3. สิทธิ์การเข้างาน ประตู และที่นั่ง',
    itemIds: ['gateInfo', 'seatInfo', 'priceInfo'],
  },
  {
    id: 'schedule',
    name: '4. กำหนดการและสถานที่',
    itemIds: ['dateTime', 'venue'],
  },
  {
    id: 'security',
    name: '5. ผู้ถือบัตรและบาร์โค้ดความปลอดภัย',
    itemIds: ['buyerName', 'ticketCode', 'barcode'],
  },
  {
    id: 'stub',
    name: '6. หางบัตรตรวจเข้างาน (Stub & QR)',
    itemIds: ['stubEventSummary', 'qrCode', 'qrCodeLabel', 'scanHint', 'orderId'],
  },
  {
    id: 'footer',
    name: '7. เงื่อนไขและข้อตกลงท้ายบัตร',
    itemIds: ['footerNote'],
  },
];

const PRESETS: Record<string, { name: string; desc: string; apply: (s: TicketDesignerState) => TicketDesignerState }> = {
  'classic-white': {
    name: 'บัตรขาวทางการ (Official White)',
    desc: 'บัตรคอนเสิร์ตกระดาษอาร์ตการ์ดขาวสะอาด ขอบคมชัด ตัวหนังสือสีเข้มอ่านง่าย สไตล์บัตรทางการมาตรฐานสากล',
    apply: (s) => ({
      ...s,
      presetId: 'classic-white',
      bgType: 'solid',
      bgColor: '#ffffff',
      borderColor: '#cbd5e1',
      borderRadius: 4,
      borderWidth: 1,
      tearLineColor: '#94a3b8',
      tearLineStyle: 'dashed',
      bgOverlayDarkness: 0,
      bgOverlayBlur: 0,
      qrFgColor: '#000000',
      qrBgColor: '#ffffff',
      elements: {
        ...s.elements,
        brandLogo: { ...s.elements.brandLogo, color: '#0f172a' },
        eventTitle: { ...s.elements.eventTitle, color: '#0f172a' },
        zoneBadge: { ...s.elements.zoneBadge, bgColor: 'transparent', color: '#0f172a', borderWidth: 0, borderColor: 'transparent' },
        gateInfo: { ...s.elements.gateInfo, color: '#0f172a' },
        seatInfo: { ...s.elements.seatInfo, color: '#0f172a' },
        priceInfo: { ...s.elements.priceInfo, color: '#0f172a' },
        dateTime: { ...s.elements.dateTime, color: '#0f172a' },
        venue: { ...s.elements.venue, color: '#0f172a' },
        buyerName: { ...s.elements.buyerName, color: '#0f172a' },
        ticketCode: { ...s.elements.ticketCode, color: '#0f172a' },
        barcode: { ...s.elements.barcode, color: '#0f172a' },
        orderId: { ...s.elements.orderId, color: '#64748b' },
        footerNote: { ...s.elements.footerNote, color: '#64748b' },
        stubEventSummary: { ...s.elements.stubEventSummary, color: '#0f172a' },
        qrCodeLabel: { ...s.elements.qrCodeLabel, color: '#0f172a' },
        scanHint: { ...s.elements.scanHint, color: '#64748b' },
      },
    }),
  },
  'matte-black': {
    name: 'การ์ดดำด้านพรีเมียม (Matte Black)',
    desc: 'กระดาษการ์ดดำด้านลึก ตัดขอบสีเงิน ตัวหนังสือสีขาวนวล สไตล์คอนเสิร์ตระดับโลก',
    apply: (s) => ({
      ...s,
      presetId: 'matte-black',
      bgType: 'solid',
      bgColor: '#111827',
      borderColor: '#374151',
      borderRadius: 6,
      borderWidth: 1,
      tearLineColor: '#4b5563',
      tearLineStyle: 'notched',
      bgOverlayDarkness: 0,
      bgOverlayBlur: 0,
      qrFgColor: '#000000',
      qrBgColor: '#ffffff',
      elements: {
        ...s.elements,
        brandLogo: { ...s.elements.brandLogo, color: '#f8fafc' },
        eventTitle: { ...s.elements.eventTitle, color: '#ffffff' },
        zoneBadge: { ...s.elements.zoneBadge, bgColor: 'transparent', color: '#f3f4f6', borderWidth: 0, borderColor: 'transparent' },
        gateInfo: { ...s.elements.gateInfo, color: '#f3f4f6' },
        seatInfo: { ...s.elements.seatInfo, color: '#f3f4f6' },
        priceInfo: { ...s.elements.priceInfo, color: '#f3f4f6' },
        dateTime: { ...s.elements.dateTime, color: '#f3f4f6' },
        venue: { ...s.elements.venue, color: '#f3f4f6' },
        buyerName: { ...s.elements.buyerName, color: '#f3f4f6' },
        ticketCode: { ...s.elements.ticketCode, color: '#f3f4f6' },
        barcode: { ...s.elements.barcode, color: '#f3f4f6' },
        orderId: { ...s.elements.orderId, color: '#9ca3af' },
        footerNote: { ...s.elements.footerNote, color: '#9ca3af' },
        stubEventSummary: { ...s.elements.stubEventSummary, color: '#ffffff' },
        qrCodeLabel: { ...s.elements.qrCodeLabel, color: '#f3f4f6' },
        scanHint: { ...s.elements.scanHint, color: '#9ca3af' },
      },
    }),
  },
  'vip-gold-pass': {
    name: 'วีไอพี การ์ดทอง (VIP Gold Pass)',
    desc: 'บัตรออบซิเดียนหรูหรา ขอบทอง ตัวหนังสือทองประกายฟอยล์ สมฐานะบัตร VIP',
    apply: (s) => ({
      ...s,
      presetId: 'vip-gold-pass',
      bgType: 'solid',
      bgColor: '#18181b',
      borderColor: '#d97706',
      borderRadius: 8,
      borderWidth: 1,
      tearLineColor: '#b45309',
      tearLineStyle: 'dashed',
      bgOverlayDarkness: 0,
      bgOverlayBlur: 0,
      qrFgColor: '#000000',
      qrBgColor: '#fef08a',
      elements: {
        ...s.elements,
        brandLogo: { ...s.elements.brandLogo, color: '#fbbf24' },
        eventTitle: { ...s.elements.eventTitle, color: '#fbbf24' },
        zoneBadge: { ...s.elements.zoneBadge, bgColor: 'transparent', color: '#fbbf24', borderWidth: 0, borderColor: 'transparent' },
        gateInfo: { ...s.elements.gateInfo, color: '#fef3c7' },
        seatInfo: { ...s.elements.seatInfo, color: '#fef3c7' },
        priceInfo: { ...s.elements.priceInfo, color: '#fef3c7' },
        dateTime: { ...s.elements.dateTime, color: '#fef3c7' },
        venue: { ...s.elements.venue, color: '#fef3c7' },
        buyerName: { ...s.elements.buyerName, color: '#fef3c7' },
        ticketCode: { ...s.elements.ticketCode, color: '#fef3c7' },
        barcode: { ...s.elements.barcode, color: '#fbbf24' },
        orderId: { ...s.elements.orderId, color: '#a1a1aa' },
        footerNote: { ...s.elements.footerNote, color: '#a1a1aa' },
        stubEventSummary: { ...s.elements.stubEventSummary, color: '#fbbf24' },
        qrCodeLabel: { ...s.elements.qrCodeLabel, color: '#fbbf24' },
        scanHint: { ...s.elements.scanHint, color: '#a1a1aa' },
      },
    }),
  },
  'festival-kraft': {
    name: 'บัตรกระดาษคราฟท์ (Festival Kraft)',
    desc: 'โทนกระดาษคราฟท์ธรรมชาติ อบอุ่น สไตล์เทศกาลดนตรีกลางแจ้งและงานอินดี้',
    apply: (s) => ({
      ...s,
      presetId: 'festival-kraft',
      bgType: 'solid',
      bgColor: '#f4ede4',
      borderColor: '#d5bdaf',
      borderRadius: 4,
      borderWidth: 1,
      tearLineColor: '#c6ac8f',
      tearLineStyle: 'dashed',
      bgOverlayDarkness: 0,
      bgOverlayBlur: 0,
      qrFgColor: '#2d1500',
      qrBgColor: '#ffffff',
      elements: {
        ...s.elements,
        brandLogo: { ...s.elements.brandLogo, color: '#2d1500' },
        eventTitle: { ...s.elements.eventTitle, color: '#2d1500' },
        zoneBadge: { ...s.elements.zoneBadge, bgColor: 'transparent', color: '#38281f', borderWidth: 0, borderColor: 'transparent' },
        gateInfo: { ...s.elements.gateInfo, color: '#38281f' },
        seatInfo: { ...s.elements.seatInfo, color: '#38281f' },
        priceInfo: { ...s.elements.priceInfo, color: '#38281f' },
        dateTime: { ...s.elements.dateTime, color: '#38281f' },
        venue: { ...s.elements.venue, color: '#38281f' },
        buyerName: { ...s.elements.buyerName, color: '#38281f' },
        ticketCode: { ...s.elements.ticketCode, color: '#38281f' },
        barcode: { ...s.elements.barcode, color: '#2d1500' },
        orderId: { ...s.elements.orderId, color: '#78350f' },
        footerNote: { ...s.elements.footerNote, color: '#78350f' },
        stubEventSummary: { ...s.elements.stubEventSummary, color: '#2d1500' },
        qrCodeLabel: { ...s.elements.qrCodeLabel, color: '#2d1500' },
        scanHint: { ...s.elements.scanHint, color: '#78350f' },
      },
    }),
  },
  'minimal-slate': {
    name: 'โมเดิร์น สเลทการ์ด (Modern Slate)',
    desc: 'กระดาษเทาสเลทเรียบหรู คมชัด เป็นทางการ น่าเชื่อถือ สไตล์โมเดิร์นร่วมสมัย',
    apply: (s) => ({
      ...s,
      presetId: 'minimal-slate',
      bgType: 'solid',
      bgColor: '#f1f5f9',
      borderColor: '#cbd5e1',
      borderRadius: 6,
      borderWidth: 1,
      tearLineColor: '#94a3b8',
      tearLineStyle: 'solid',
      bgOverlayDarkness: 0,
      bgOverlayBlur: 0,
      qrFgColor: '#0f172a',
      qrBgColor: '#ffffff',
      elements: {
        ...s.elements,
        brandLogo: { ...s.elements.brandLogo, color: '#0f172a' },
        eventTitle: { ...s.elements.eventTitle, color: '#0f172a' },
        zoneBadge: { ...s.elements.zoneBadge, bgColor: 'transparent', color: '#1e293b', borderWidth: 0, borderColor: 'transparent' },
        gateInfo: { ...s.elements.gateInfo, color: '#1e293b' },
        seatInfo: { ...s.elements.seatInfo, color: '#1e293b' },
        priceInfo: { ...s.elements.priceInfo, color: '#1e293b' },
        dateTime: { ...s.elements.dateTime, color: '#1e293b' },
        venue: { ...s.elements.venue, color: '#1e293b' },
        buyerName: { ...s.elements.buyerName, color: '#1e293b' },
        ticketCode: { ...s.elements.ticketCode, color: '#1e293b' },
        barcode: { ...s.elements.barcode, color: '#0f172a' },
        orderId: { ...s.elements.orderId, color: '#64748b' },
        footerNote: { ...s.elements.footerNote, color: '#64748b' },
        stubEventSummary: { ...s.elements.stubEventSummary, color: '#0f172a' },
        qrCodeLabel: { ...s.elements.qrCodeLabel, color: '#1e293b' },
        scanHint: { ...s.elements.scanHint, color: '#64748b' },
      },
    }),
  },
};

const SAMPLE_BACKGROUNDS = [
  {
    name: 'เวทีคอนเสิร์ตร็อก',
    url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'แสงเลเซอร์และควันเวที',
    url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'ผู้ชมและแสงสีเสียง',
    url: 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'เฟสติวัลยามค่ำคืน',
    url: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1200&q=80',
  },
];

function SecurityBarcodeSvg({
  code,
  color = '#0f172a',
  secondaryColor = '#64748b',
}: {
  code: string;
  color?: string;
  secondaryColor?: string;
}) {
  const bars = useMemo(() => {
    const list: { id: string; width: number; isBlack: boolean }[] = [
      { id: 'start-1', width: 3, isBlack: true },
      { id: 'start-2', width: 2, isBlack: false },
      { id: 'start-3', width: 2, isBlack: true },
    ];
    let isBlack = false;
    for (let i = 0; i < code.length; i++) {
      const codeVal = code.charCodeAt(i);
      const w1 = ((codeVal * 3) % 4) + 1;
      const w2 = ((codeVal * 7) % 3) + 1;
      list.push({ id: `bar-${i}-a`, width: w1, isBlack });
      isBlack = !isBlack;
      list.push({ id: `bar-${i}-b`, width: w2, isBlack });
      isBlack = !isBlack;
    }
    list.push(
      { id: 'end-1', width: 2, isBlack: true },
      { id: 'end-2', width: 2, isBlack: false },
      { id: 'end-3', width: 3, isBlack: true },
    );
    return list;
  }, [code]);

  let currentX = 0;
  return (
    <div className="security-barcode-container">
      <div className="security-barcode-label" style={{ color: secondaryColor }}>SECURITY VERIFICATION</div>
      <svg width="180" height="34" viewBox="0 0 180 34" fill="none" xmlns="http://www.w3.org/2000/svg">
        <title>Security Barcode</title>
        {bars.map((bar) => {
          const x = currentX;
          currentX += bar.width * 2;
          if (!bar.isBlack || currentX > 175) return null;
          return <rect key={bar.id} x={x} y={0} width={bar.width * 1.8} height={34} fill={color} />;
        })}
      </svg>
      <div className="security-barcode-code">*{code}*</div>
    </div>
  );
}

export function AdminTicketDesigner() {
  const [state, setState] = useState<TicketDesignerState>(DEFAULT_STATE);
  const [workspaceStage, setWorkspaceStage] = useState<WorkspaceStageSettings>(DEFAULT_WORKSPACE_STAGE);
  const [selectedId, setSelectedId] = useState<string | null>('eventTitle');
  const [activeSideTab, setActiveSideTab] = useState<DesignerTabId>('elements');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'studio' | 'mobile' | 'print'>('studio');
  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>('fit');
  const [manualScale, setManualScale] = useState<number>(100);
  const [fitScale, setFitScale] = useState<number>(85);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [simulatedScanResult, setSimulatedScanResult] = useState<string | null>(null);
  const [masterSavedToast, setMasterSavedToast] = useState<string | null>(null);
  const [isDragOverDropzone, setIsDragOverDropzone] = useState<boolean>(false);

  // Dragging tracking
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number; itemX: number; itemY: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const studioRootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);

  // Auto-fit calculation
  useEffect(() => {
    const updateFit = () => {
      if (!stageRef.current) return;
      const stageW = stageRef.current.clientWidth;
      const stageH = stageRef.current.clientHeight;
      if (stageW <= 0 || stageH <= 0) return;
      const scaleX = (stageW - 64) / 1000;
      const scaleY = (stageH - 96) / 420;
      const fit = Math.max(0.35, Math.min(1.0, Math.floor(Math.min(scaleX, scaleY) * 100) / 100));
      setFitScale(Math.round(fit * 100));
    };

    updateFit();
    const el = stageRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => updateFit());
    observer.observe(el);
    window.addEventListener('resize', updateFit);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateFit);
    };
  }, []);

  // Load Saved Master Template on Mount if exists (Local or Server)
  useEffect(() => {
    let active = true;
    try {
      const saved = localStorage.getItem(MASTER_TEMPLATE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && parsed.elements) {
          setState((prev) => ({
            ...prev,
            ...parsed,
            elements: {
              ...prev.elements,
              ...parsed.elements,
            },
          }));
          return;
        }
      }
    } catch {
      // Fallback to default state
    }

    // If not found in localStorage, fetch from server
    fetch('/api/owner/ticket-master-template')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data?.template) return;
        setState((prev) => ({
          ...prev,
          ...data.template,
          elements: {
            ...prev.elements,
            ...(data.template.elements || {}),
          },
        }));
        try {
          localStorage.setItem(MASTER_TEMPLATE_STORAGE_KEY, JSON.stringify(data.template));
        } catch {
          // ignore
        }
      })
      .catch(() => {
        // Fallback to default state
      });

    return () => {
      active = false;
    };
  }, []);

  const effectiveScale = zoomMode === 'fit' ? fitScale : manualScale;

  // Form IDs helper
  const baseId = useId();
  const getFieldId = useCallback((name: string) => `${baseId}-${name}`, [baseId]);

  // Selected Item helper
  const selectedItem = useMemo(() => {
    if (!selectedId) return null;
    return state.elements[selectedId] || null;
  }, [selectedId, state.elements]);

  // Live QR SVG
  const qrSvgDataUrl = useMemo(() => {
    try {
      return generateCustomQrSvg(state.qrPayload, {
        fgColor: state.qrFgColor,
        bgColor: state.qrBgColor,
        moduleSize: 8,
        quietZone: 2,
      });
    } catch {
      return generateCustomQrSvg('TK-SAMPLE-CODE', {
        fgColor: '#0f172a',
        bgColor: '#ffffff',
      });
    }
  }, [state.qrPayload, state.qrFgColor, state.qrBgColor]);

  // Dynamic Workspace Stage Background Style
  const stageBackgroundStyle = useMemo(() => {
    const bg = workspaceStage.customColor || '#f8fafc';
    switch (workspaceStage.style) {
      case 'dots':
        return {
          backgroundColor: bg,
          backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px)',
          backgroundSize: '20px 20px',
        };
      case 'white':
        return {
          backgroundColor: '#ffffff',
          backgroundImage: 'none',
        };
      case 'light-slate':
        return {
          backgroundColor: '#f1f5f9',
          backgroundImage: 'none',
        };
      case 'grid':
        return {
          backgroundColor: bg,
          backgroundImage:
            'linear-gradient(to right, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        };
      case 'dark-neutral':
        return {
          backgroundColor: '#334155',
          backgroundImage: 'radial-gradient(#475569 1.2px, transparent 1.2px)',
          backgroundSize: '20px 20px',
        };
      default:
        return {
          backgroundColor: bg,
          backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px)',
          backgroundSize: '20px 20px',
        };
    }
  }, [workspaceStage]);

  // Dynamic Notch Color matching stage background
  const notchColor = useMemo(() => {
    if (workspaceStage.style === 'white') return '#ffffff';
    if (workspaceStage.style === 'light-slate') return '#f1f5f9';
    if (workspaceStage.style === 'dark-neutral') return '#334155';
    return workspaceStage.customColor || '#f8fafc';
  }, [workspaceStage]);

  // Background CSS for Ticket Card
  const backgroundStyle = useMemo(() => {
    switch (state.bgType) {
      case 'solid':
        return { backgroundColor: state.bgColor };
      case 'gradient':
        if (state.gradientType === 'linear') {
          return {
            backgroundImage: `linear-gradient(${state.gradientAngle}deg, ${state.gradientStart}, ${state.gradientEnd})`,
          };
        }
        return {
          backgroundImage: `radial-gradient(circle at center, ${state.gradientStart}, ${state.gradientEnd})`,
        };
      case 'image':
        return {
          backgroundImage: `url(${state.bgImageUrl || SAMPLE_BACKGROUNDS[0].url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        };
      case 'pattern': {
        if (state.patternType === 'dots') {
          return {
            backgroundColor: state.bgColor,
            backgroundImage: 'radial-gradient(#94a3b8 1.5px, transparent 1.5px)',
            backgroundSize: '16px 16px',
          };
        }
        if (state.patternType === 'grid') {
          return {
            backgroundColor: state.bgColor,
            backgroundImage:
              'linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          };
        }
        if (state.patternType === 'stripes') {
          return {
            backgroundColor: state.bgColor,
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(148, 163, 184, 0.2) 10px, rgba(148, 163, 184, 0.2) 20px)',
          };
        }
        return { backgroundColor: state.bgColor };
      }
      default:
        return { backgroundColor: state.bgColor };
    }
  }, [
    state.bgType,
    state.bgColor,
    state.gradientType,
    state.gradientAngle,
    state.gradientStart,
    state.gradientEnd,
    state.bgImageUrl,
    state.patternType,
  ]);

  // Pointer Down on Element
  const handlePointerDown = (id: string, e: PointerEvent<HTMLDivElement>) => {
    if (viewMode !== 'studio') return;
    e.stopPropagation();
    setSelectedId(id);
    setActiveSideTab('elements');
    setDraggingId(id);

    const elem = state.elements[id];
    if (!elem) return;

    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      itemX: elem.x,
      itemY: elem.y,
    };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  // Pointer Move
  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingId || !dragStartRef.current) return;

    const scale = effectiveScale / 100;
    const deltaX = (e.clientX - dragStartRef.current.clientX) / scale;
    const deltaY = (e.clientY - dragStartRef.current.clientY) / scale;

    const newX = Math.round(Math.max(0, Math.min(940, dragStartRef.current.itemX + deltaX)));
    const newY = Math.round(Math.max(0, Math.min(380, dragStartRef.current.itemY + deltaY)));

    setState((prev) => ({
      ...prev,
      elements: {
        ...prev.elements,
        [draggingId]: {
          ...prev.elements[draggingId],
          x: newX,
          y: newY,
        },
      },
    }));
  };

  // Pointer Up
  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (draggingId) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture release fallback
      }
      setDraggingId(null);
      dragStartRef.current = null;
    }
  };

  // Save Master Template
  const handleSaveMasterTemplate = async () => {
    try {
      localStorage.setItem(MASTER_TEMPLATE_STORAGE_KEY, JSON.stringify(state));
      window.dispatchEvent(
        new CustomEvent('ticket_master_template_updated', { detail: state })
      );
      window.dispatchEvent(
        new CustomEvent('ticket:master-template-changed', { detail: state })
      );

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const ch = new BroadcastChannel('ticket_master_template_channel');
          ch.postMessage({ type: 'UPDATE', template: state });
          ch.close();
        } catch {
          // ignore channel error
        }
      }

      // Synchronize with database
      try {
        await fetch('/api/owner/ticket-master-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template: state }),
        });
      } catch {
        // server sync fallback
      }

      setMasterSavedToast(
        'บันทึกแบบบัตรหลักของระบบสำเร็จ แบบบัตรนี้ถูกนำไปใช้เป็นมาตรฐานกับบัตรทุกคอนเสิร์ตทั่วทั้งระบบแล้ว'
      );
      setTimeout(() => {
        setMasterSavedToast(null);
      }, 4500);
    } catch {
      // ignore
    }
  };

  // Load Saved Master Template
  const handleLoadMasterTemplate = async () => {
    try {
      let saved = localStorage.getItem(MASTER_TEMPLATE_STORAGE_KEY);
      if (!saved) {
        try {
          const res = await fetch('/api/owner/ticket-master-template');
          if (res.ok) {
            const data = await res.json();
            if (data?.template) {
              saved = JSON.stringify(data.template);
              localStorage.setItem(MASTER_TEMPLATE_STORAGE_KEY, saved);
            }
          }
        } catch {
          // ignore
        }
      }

      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          setState({
            ...DEFAULT_STATE,
            ...parsed,
            elements: {
              ...DEFAULT_STATE.elements,
              ...(parsed.elements || {}),
            },
          });
          setMasterSavedToast('โหลดแบบบัตรหลักของระบบเรียบร้อย');
          setTimeout(() => setMasterSavedToast(null), 3000);
        }
      } else {
        setMasterSavedToast('ยังไม่มีการบันทึกแบบบัตรหลัก ระบบจะใช้ค่าเริ่มต้นมาตรฐาน');
        setTimeout(() => setMasterSavedToast(null), 3000);
      }
    } catch {
      // ignore
    }
  };

  // Reset to default
  const handleResetPositions = () => {
    setState(DEFAULT_STATE);
    setSelectedId('eventTitle');
  };

  // Apply Preset
  const handleApplyPreset = (presetKey: string) => {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    setState((prev) => preset.apply(prev));
  };

  // File Upload for Ticket Background
  const handleTicketImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (typeof evt.target?.result === 'string') {
        setState((prev) => ({
          ...prev,
          bgType: 'image',
          bgImageUrl: evt.target?.result as string,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Drag & drop handlers for upload box
  const handleDropzoneDragOver = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragOverDropzone(true);
  };

  const handleDropzoneDragLeave = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragOverDropzone(false);
  };

  const handleDropzoneDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragOverDropzone(false);
    const file = e.dataTransfer.files?.[0];
    if (!file?.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (typeof evt.target?.result === 'string') {
        setState((prev) => ({
          ...prev,
          bgType: 'image',
          bgImageUrl: evt.target?.result as string,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClearCardImage = () => {
    setState((prev) => ({
      ...prev,
      bgType: 'solid',
      bgColor: '#ffffff',
      bgImageUrl: '',
    }));
  };

  // Toggle Fullscreen Mode
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      studioRootRef.current?.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // High-Res PNG Export (1200 x 500 px canvas)
  const handleExportPng = useCallback(async () => {
    setIsExporting(true);
    try {
      const width = 1200;
      const height = 500;
      const scaleFactor = 1200 / 1000; // ratio from preview 1000 to export 1200

      const drawRoundedRect = (
        c: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        r: number
      ) => {
        if (r <= 0) {
          if (typeof c.rect === 'function') c.rect(x, y, w, h);
          return;
        }
        if (typeof c.roundRect === 'function') {
          c.roundRect(x, y, w, h, r);
        } else if (typeof c.arcTo === 'function') {
          c.moveTo(x + r, y);
          c.lineTo(x + w - r, y);
          c.arcTo(x + w, y, x + w, y + r, r);
          c.lineTo(x + w, y + h - r);
          c.arcTo(x + w, y + h, x + w - r, y + h, r);
          c.lineTo(x + r, y + h);
          c.arcTo(x, y + h, x, y + h - r, r);
          c.lineTo(x, y + r);
          c.arcTo(x, y, x + r, y, r);
        } else if (typeof c.rect === 'function') {
          c.rect(x, y, w, h);
        }
      };

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');

      const cardRadius = Math.max((typeof state.borderRadius === 'number' ? state.borderRadius : 4) * scaleFactor, 0);

      // Clip canvas for rounded card corners
      if (cardRadius > 0 && typeof ctx.clip === 'function') {
        ctx.save();
        ctx.beginPath();
        drawRoundedRect(ctx, 0, 0, width, height, cardRadius);
        ctx.clip();
      }

      // 1. Background
      if (state.bgType === 'solid') {
        ctx.fillStyle = state.bgColor;
        ctx.fillRect(0, 0, width, height);
      } else if (state.bgType === 'gradient') {
        const rad = (state.gradientAngle * Math.PI) / 180;
        const x2 = width * Math.abs(Math.cos(rad));
        const y2 = height * Math.abs(Math.sin(rad));
        const grad = ctx.createLinearGradient(0, 0, x2, y2);
        grad.addColorStop(0, state.gradientStart);
        grad.addColorStop(1, state.gradientEnd);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      } else if (state.bgType === 'image' && state.bgImageUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = state.bgImageUrl;
        });
        if (img.width > 0) {
          ctx.drawImage(img, 0, 0, width, height);
        } else {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, width, height);
        }
      } else {
        ctx.fillStyle = state.bgColor;
        ctx.fillRect(0, 0, width, height);
      }

      // 2. Darkness Overlay
      if (state.bgOverlayDarkness > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${state.bgOverlayDarkness / 100})`;
        ctx.fillRect(0, 0, width, height);
      }

      // 3. Border
      if (state.borderWidth > 0) {
        ctx.strokeStyle = state.borderColor;
        ctx.lineWidth = state.borderWidth * scaleFactor;
        if (cardRadius > 0 && typeof ctx.beginPath === 'function') {
          ctx.beginPath();
          drawRoundedRect(ctx, (state.borderWidth * scaleFactor) / 2, (state.borderWidth * scaleFactor) / 2, width - state.borderWidth * scaleFactor, height - state.borderWidth * scaleFactor, cardRadius);
          ctx.stroke();
        } else {
          ctx.strokeRect(0, 0, width, height);
        }
      }

      // 4. Tear Line
      const tearX = Math.round(state.tearLineX * scaleFactor);
      if (state.tearLineStyle !== 'none') {
        ctx.save();
        ctx.strokeStyle = state.tearLineColor;
        ctx.lineWidth = 2;
        if (state.tearLineStyle === 'dashed') ctx.setLineDash([8, 8]);
        if (state.tearLineStyle === 'dotted') ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(tearX, 0);
        ctx.lineTo(tearX, height);
        ctx.stroke();
        ctx.restore();
      }

      // 5. Draw Movable Elements at exact coordinates
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      // Brand Logo
      const logo = state.elements.brandLogo;
      if (logo?.visible) {
        ctx.fillStyle = logo.color || '#0f172a';
        ctx.font = `bold 16px ${state.fontFamily}, Kanit, sans-serif`;
        ctx.fillText('TICKET', logo.x * scaleFactor + 24, logo.y * scaleFactor);
        if (logo.secondaryText) {
          ctx.fillStyle = logo.secondaryColor || '#64748b';
          ctx.font = `10px ${state.fontFamily}, Kanit, sans-serif`;
          ctx.fillText(logo.secondaryText, logo.x * scaleFactor + 92, logo.y * scaleFactor + 4);
        }
      }

      // Event Title
      const title = state.elements.eventTitle;
      if (title?.visible && title.text) {
        ctx.fillStyle = title.color || '#0f172a';
        ctx.font = `${title.fontWeight || '700'} ${Math.round((title.fontSize || 26) * scaleFactor)}px ${state.fontFamily}, Kanit, sans-serif`;
        ctx.fillText(title.text, title.x * scaleFactor, title.y * scaleFactor);
      }

      // Zone Badge
      const badge = state.elements.zoneBadge;
      if (badge?.visible && badge.text) {
        const badgeX = badge.x * scaleFactor;
        const badgeY = badge.y * scaleFactor;
        ctx.font = `bold ${Math.round((badge.fontSize || 14) * scaleFactor)}px ${state.fontFamily}, Kanit, sans-serif`;
        const textWidth = ctx.measureText(badge.text).width;
        const hasBg = badge.bgColor && badge.bgColor !== 'transparent';
        const bWidth = badge.borderWidth ?? (badge.borderColor && badge.borderColor !== 'transparent' ? 1 : 0);
        const hasBorder = bWidth > 0 && badge.borderColor && badge.borderColor !== 'transparent';

        if (hasBg || hasBorder) {
          const padX = 8 * scaleFactor;
          const boxW = textWidth + padX * 2;
          const boxH = 30 * scaleFactor;
          if (hasBg) {
            ctx.fillStyle = badge.bgColor as string;
            ctx.fillRect(badgeX, badgeY, boxW, boxH);
          }
          if (hasBorder) {
            ctx.strokeStyle = badge.borderColor as string;
            ctx.lineWidth = bWidth * scaleFactor;
            ctx.strokeRect(badgeX, badgeY, boxW, boxH);
          }
          ctx.fillStyle = badge.color || '#0f172a';
          ctx.fillText(badge.text, badgeX + padX, badgeY + 6 * scaleFactor);
        } else {
          ctx.fillStyle = badge.color || '#0f172a';
          ctx.fillText(badge.text, badgeX, badgeY);
        }
      }

      // Other Text Elements
      const textKeys = [
        'gateInfo',
        'seatInfo',
        'priceInfo',
        'dateTime',
        'venue',
        'buyerName',
        'ticketCode',
        'orderId',
        'footerNote',
        'stubEventSummary',
        'qrCodeLabel',
        'scanHint',
      ];
      for (const k of textKeys) {
        const el = state.elements[k];
        if (!el?.visible) continue;

        const posX = el.x * scaleFactor;
        const posY = el.y * scaleFactor;

        // Optional Box Background / Border for any element
        const hasBg = el.bgColor && el.bgColor !== 'transparent';
        const bWidth = el.borderWidth ?? (el.borderColor && el.borderColor !== 'transparent' ? 1 : 0);
        const hasBorder = bWidth > 0 && el.borderColor && el.borderColor !== 'transparent';

        if (hasBg || hasBorder) {
          ctx.font = `${el.fontWeight || 'normal'} ${Math.round((el.fontSize || 14) * scaleFactor)}px ${state.fontFamily}, Kanit, sans-serif`;
          const textW = Math.max(
            el.text ? ctx.measureText(el.text).width : 0,
            el.secondaryText ? ctx.measureText(el.secondaryText).width : 0,
          );
          const padW = 8 * scaleFactor;
          const padH = 4 * scaleFactor;
          const boxW = textW + padW * 2;
          const boxH = (el.secondaryText ? 36 : 24) * scaleFactor;

          if (hasBg) {
            ctx.fillStyle = el.bgColor as string;
            ctx.fillRect(posX - padW, posY - padH, boxW, boxH);
          }
          if (hasBorder) {
            ctx.strokeStyle = el.borderColor as string;
            ctx.lineWidth = bWidth * scaleFactor;
            ctx.strokeRect(posX - padW, posY - padH, boxW, boxH);
          }
        }

        if (el.secondaryText) {
          ctx.fillStyle = el.secondaryColor || '#64748b';
          ctx.font = `12px ${state.fontFamily}, Kanit, sans-serif`;
          ctx.fillText(el.secondaryText, posX, posY);
        }

        if (el.text) {
          ctx.fillStyle = el.color || '#0f172a';
          ctx.font = `${el.fontWeight || 'normal'} ${Math.round((el.fontSize || 14) * scaleFactor)}px ${state.fontFamily}, Kanit, sans-serif`;
          ctx.fillText(el.text, posX, el.secondaryText ? posY + 18 : posY);
        }
      }

      // Barcode element
      const bcode = state.elements.barcode;
      if (bcode?.visible && bcode.text) {
        const bX = bcode.x * scaleFactor;
        const bY = bcode.y * scaleFactor;
        ctx.fillStyle = bcode.secondaryColor || '#64748b';
        ctx.font = `11px ${state.fontFamily}, Kanit, sans-serif`;
        ctx.fillText('SECURITY VERIFICATION', bX, bY);
        // Draw bars
        ctx.fillStyle = bcode.color || '#0f172a';
        let barOffset = 0;
        for (let i = 0; i < 35; i++) {
          const w = (i % 3 === 0 ? 3 : 1.5) * scaleFactor;
          ctx.fillRect(bX + barOffset, bY + 16, w, 24 * scaleFactor);
          barOffset += w + 2 * scaleFactor;
        }
        ctx.fillText(`*${bcode.text}*`, bX, bY + 16 + 26 * scaleFactor);
      }

      // 6. Draw QR Code
      const qr = state.elements.qrCode;
      if (qr?.visible) {
        const qrImg = new Image();
        await new Promise<void>((resolve) => {
          qrImg.onload = () => resolve();
          qrImg.onerror = () => resolve();
          qrImg.src = qrSvgDataUrl;
        });
        const qrW = (qr.size || 155) * scaleFactor;
        const qrX = qr.x * scaleFactor;
        const qrY = qr.y * scaleFactor;
        const qrPad = 8 * scaleFactor;
        const qrRadius = 8 * scaleFactor;
        const boxX = qrX - qrPad;
        const boxY = qrY - qrPad;
        const boxW = qrW + qrPad * 2;
        const boxH = qrW + qrPad * 2;

        ctx.save();
        ctx.fillStyle = state.qrBgColor && state.qrBgColor !== 'transparent' ? state.qrBgColor : '#ffffff';
        if (typeof ctx.beginPath === 'function') {
          ctx.beginPath();
          drawRoundedRect(ctx, boxX, boxY, boxW, boxH, qrRadius);
          if (typeof ctx.fill === 'function') {
            ctx.fill();
          } else {
            ctx.fillRect(boxX, boxY, boxW, boxH);
          }
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1 * scaleFactor;
          if (typeof ctx.stroke === 'function') ctx.stroke();
        } else {
          ctx.fillRect(boxX, boxY, boxW, boxH);
        }
        ctx.restore();

        ctx.save();
        if (typeof ctx.beginPath === 'function' && typeof ctx.clip === 'function') {
          ctx.beginPath();
          drawRoundedRect(ctx, qrX, qrY, qrW, qrW, 4 * scaleFactor);
          ctx.clip();
        }
        ctx.drawImage(qrImg, qrX, qrY, qrW, qrW);
        ctx.restore();
      }

      // Trigger Download
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `ticket-design-${state.presetId}-${Date.now()}.png`;
      a.click();
    } finally {
      setIsExporting(false);
    }
  }, [state, qrSvgDataUrl]);

  // Helper to resolve box background & border styles for any element
  const getElementBoxStyle = (el: MovableItem | undefined): CSSProperties => {
    if (!el) return {};
    const hasBg = el.bgColor && el.bgColor !== 'transparent';
    const bWidth = el.borderWidth ?? (el.borderColor && el.borderColor !== 'transparent' ? 1 : 0);
    const hasBorder = bWidth > 0 && el.borderColor && el.borderColor !== 'transparent';
    if (!hasBg && !hasBorder) return {};
    return {
      backgroundColor: hasBg ? el.bgColor : 'transparent',
      borderColor: hasBorder ? el.borderColor : 'transparent',
      borderWidth: `${bWidth}px`,
      borderStyle: hasBorder ? 'solid' : 'none',
      padding: '4px 8px',
      borderRadius: '4px',
    };
  };

  // Render Canonical Ticket Surface
  const renderTicketCard = (isInteractive: boolean) => {
    return (
      <div
        className="ticket-surface-box"
        style={{
          width: '1000px',
          height: '420px',
          transform: isInteractive ? `scale(${effectiveScale / 100})` : 'none',
          transformOrigin: 'top left',
          borderRadius: `${state.borderRadius}px`,
          borderWidth: `${state.borderWidth}px`,
          borderStyle: state.borderWidth > 0 ? 'solid' : 'none',
          borderColor: state.borderColor,
          fontFamily: `${state.fontFamily}, Kanit, sans-serif`,
          ...backgroundStyle,
        }}
      >
        {/* Darkness Overlay */}
        {state.bgOverlayDarkness > 0 && (
          <div
            className="ticket-surface-overlay"
            style={{
              backgroundColor: `rgba(0, 0, 0, ${state.bgOverlayDarkness / 100})`,
              backdropFilter: state.bgOverlayBlur > 0 ? `blur(${state.bgOverlayBlur}px)` : 'none',
            }}
          />
        )}

        {/* Tear Line Divider (Draggable X) */}
        {state.tearLineStyle !== 'none' && (
          <div
            className={`ticket-tear-line-vertical ${state.tearLineStyle}`}
            style={{
              left: `${state.tearLineX}px`,
              borderColor: state.tearLineColor,
            }}
          >
            {state.tearLineStyle === 'notched' && (
              <>
                <div className="tear-notch notch-top" style={{ backgroundColor: notchColor }} />
                <div className="tear-notch notch-bottom" style={{ backgroundColor: notchColor }} />
              </>
            )}
          </div>
        )}

        {/* 1. Brand Logo */}
        {state.elements.brandLogo?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'brandLogo' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.brandLogo.x}px, ${state.elements.brandLogo.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('brandLogo', e)}
          >
            <div className="brand-logo-content" style={{ color: state.elements.brandLogo.color }}>
              <TicketIcon style={{ width: 18, height: 18 }} />
              <strong>{state.elements.brandLogo.text || 'TICKET'}</strong>
              <span className="brand-official-tag" style={{ color: state.elements.brandLogo.secondaryColor || '#64748b' }}>
                {state.elements.brandLogo.secondaryText || 'OFFICIAL CONCERT PASS'}
              </span>
            </div>
            {isInteractive && selectedId === 'brandLogo' && (
              <span className="coord-chip">X: {state.elements.brandLogo.x} Y: {state.elements.brandLogo.y}</span>
            )}
          </div>
        )}

        {/* 2. Event Title */}
        {state.elements.eventTitle?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'eventTitle' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.eventTitle.x}px, ${state.elements.eventTitle.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('eventTitle', e)}
          >
            <h2
              className="element-title-text"
              style={{
                fontSize: `${state.elements.eventTitle.fontSize || 26}px`,
                fontWeight: state.elements.eventTitle.fontWeight || '700',
                color: state.elements.eventTitle.color,
                ...getElementBoxStyle(state.elements.eventTitle),
              }}
            >
              {state.elements.eventTitle.text}
            </h2>
            {isInteractive && selectedId === 'eventTitle' && (
              <span className="coord-chip">X: {state.elements.eventTitle.x} Y: {state.elements.eventTitle.y}</span>
            )}
          </div>
        )}

        {/* 3. Zone Badge */}
        {state.elements.zoneBadge?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'zoneBadge' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.zoneBadge.x}px, ${state.elements.zoneBadge.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('zoneBadge', e)}
          >
            <div className="meta-block" style={{ ...getElementBoxStyle(state.elements.zoneBadge) }}>
              <span className="meta-label" style={{ color: state.elements.zoneBadge.secondaryColor || '#64748b' }}>
                {state.elements.zoneBadge.secondaryText || 'โซน / ประเภทบัตร (ZONE & CATEGORY)'}
              </span>
              <strong className="meta-val" style={{ color: state.elements.zoneBadge.color || '#0f172a', fontSize: `${state.elements.zoneBadge.fontSize || 16}px` }}>
                {state.elements.zoneBadge.text}
              </strong>
            </div>
            {isInteractive && selectedId === 'zoneBadge' && (
              <span className="coord-chip">X: {state.elements.zoneBadge.x} Y: {state.elements.zoneBadge.y}</span>
            )}
          </div>
        )}

        {/* 4. Gate Info */}
        {state.elements.gateInfo?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'gateInfo' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.gateInfo.x}px, ${state.elements.gateInfo.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('gateInfo', e)}
          >
            <div className="meta-block" style={{ ...getElementBoxStyle(state.elements.gateInfo) }}>
              <span className="meta-label" style={{ color: state.elements.gateInfo.secondaryColor || '#64748b' }}>
                {state.elements.gateInfo.secondaryText || 'ประตูทางเข้า (GATE)'}
              </span>
              <strong className="meta-val" style={{ color: state.elements.gateInfo.color, fontSize: `${state.elements.gateInfo.fontSize || 16}px` }}>
                {state.elements.gateInfo.text}
              </strong>
            </div>
            {isInteractive && selectedId === 'gateInfo' && (
              <span className="coord-chip">X: {state.elements.gateInfo.x} Y: {state.elements.gateInfo.y}</span>
            )}
          </div>
        )}

        {/* 5. Seat Info */}
        {state.elements.seatInfo?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'seatInfo' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.seatInfo.x}px, ${state.elements.seatInfo.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('seatInfo', e)}
          >
            <div className="meta-block" style={{ ...getElementBoxStyle(state.elements.seatInfo) }}>
              <span className="meta-label" style={{ color: state.elements.seatInfo.secondaryColor || '#64748b' }}>
                {state.elements.seatInfo.secondaryText || 'แถว/ที่นั่ง (ROW / SEAT)'}
              </span>
              <strong className="meta-val" style={{ color: state.elements.seatInfo.color, fontSize: `${state.elements.seatInfo.fontSize || 16}px` }}>
                {state.elements.seatInfo.text}
              </strong>
            </div>
            {isInteractive && selectedId === 'seatInfo' && (
              <span className="coord-chip">X: {state.elements.seatInfo.x} Y: {state.elements.seatInfo.y}</span>
            )}
          </div>
        )}

        {/* 6. Price Info */}
        {state.elements.priceInfo?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'priceInfo' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.priceInfo.x}px, ${state.elements.priceInfo.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('priceInfo', e)}
          >
            <div className="meta-block" style={{ ...getElementBoxStyle(state.elements.priceInfo) }}>
              <span className="meta-label" style={{ color: state.elements.priceInfo.secondaryColor || '#64748b' }}>
                {state.elements.priceInfo.secondaryText || 'ราคาบัตร (PRICE)'}
              </span>
              <strong className="meta-val" style={{ color: state.elements.priceInfo.color, fontSize: `${state.elements.priceInfo.fontSize || 16}px` }}>
                {state.elements.priceInfo.text}
              </strong>
            </div>
            {isInteractive && selectedId === 'priceInfo' && (
              <span className="coord-chip">X: {state.elements.priceInfo.x} Y: {state.elements.priceInfo.y}</span>
            )}
          </div>
        )}

        {/* 7. Date & Time */}
        {state.elements.dateTime?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'dateTime' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.dateTime.x}px, ${state.elements.dateTime.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('dateTime', e)}
          >
            <div className="meta-block" style={{ ...getElementBoxStyle(state.elements.dateTime) }}>
              <span className="meta-label" style={{ color: state.elements.dateTime.secondaryColor || '#64748b' }}>
                {state.elements.dateTime.secondaryText || 'วันและเวลาแสดง (DATE & TIME)'}
              </span>
              <strong className="meta-val" style={{ color: state.elements.dateTime.color, fontSize: `${state.elements.dateTime.fontSize || 14}px` }}>
                {state.elements.dateTime.text}
              </strong>
            </div>
            {isInteractive && selectedId === 'dateTime' && (
              <span className="coord-chip">X: {state.elements.dateTime.x} Y: {state.elements.dateTime.y}</span>
            )}
          </div>
        )}

        {/* 8. Venue */}
        {state.elements.venue?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'venue' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.venue.x}px, ${state.elements.venue.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('venue', e)}
          >
            <div className="meta-block" style={{ ...getElementBoxStyle(state.elements.venue) }}>
              <span className="meta-label" style={{ color: state.elements.venue.secondaryColor || '#64748b' }}>
                {state.elements.venue.secondaryText || 'สถานที่จัดงาน (VENUE & HALL)'}
              </span>
              <strong className="meta-val" style={{ color: state.elements.venue.color, fontSize: `${state.elements.venue.fontSize || 14}px` }}>
                {state.elements.venue.text}
              </strong>
            </div>
            {isInteractive && selectedId === 'venue' && (
              <span className="coord-chip">X: {state.elements.venue.x} Y: {state.elements.venue.y}</span>
            )}
          </div>
        )}

        {/* 9. Buyer Name */}
        {state.elements.buyerName?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'buyerName' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.buyerName.x}px, ${state.elements.buyerName.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('buyerName', e)}
          >
            <div className="meta-block" style={{ ...getElementBoxStyle(state.elements.buyerName) }}>
              <span className="meta-label" style={{ color: state.elements.buyerName.secondaryColor || '#64748b' }}>
                {state.elements.buyerName.secondaryText || 'ผู้ถือบัตร (ATTENDEE)'}
              </span>
              <strong className="meta-val" style={{ color: state.elements.buyerName.color, fontSize: `${state.elements.buyerName.fontSize || 13}px` }}>
                {state.elements.buyerName.text}
              </strong>
            </div>
            {isInteractive && selectedId === 'buyerName' && (
              <span className="coord-chip">X: {state.elements.buyerName.x} Y: {state.elements.buyerName.y}</span>
            )}
          </div>
        )}

        {/* 10. Ticket Code */}
        {state.elements.ticketCode?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'ticketCode' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.ticketCode.x}px, ${state.elements.ticketCode.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('ticketCode', e)}
          >
            <div className="meta-block" style={{ ...getElementBoxStyle(state.elements.ticketCode) }}>
              <span className="meta-label" style={{ color: state.elements.ticketCode.secondaryColor || '#64748b' }}>
                {state.elements.ticketCode.secondaryText || 'รหัสบัตร (TICKET CODE)'}
              </span>
              <strong className="meta-val font-mono" style={{ color: state.elements.ticketCode.color, fontSize: `${state.elements.ticketCode.fontSize || 14}px` }}>
                {state.elements.ticketCode.text}
              </strong>
            </div>
            {isInteractive && selectedId === 'ticketCode' && (
              <span className="coord-chip">X: {state.elements.ticketCode.x} Y: {state.elements.ticketCode.y}</span>
            )}
          </div>
        )}

        {/* 11. Security Barcode */}
        {state.elements.barcode?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'barcode' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.barcode.x}px, ${state.elements.barcode.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('barcode', e)}
          >
            <SecurityBarcodeSvg
              code={state.elements.barcode.text || 'TK-849201-9482-01'}
              color={state.elements.barcode.color}
              secondaryColor={state.elements.barcode.secondaryColor}
            />
            {isInteractive && selectedId === 'barcode' && (
              <span className="coord-chip">X: {state.elements.barcode.x} Y: {state.elements.barcode.y}</span>
            )}
          </div>
        )}

        {/* 12. Footer Note */}
        {state.elements.footerNote?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'footerNote' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.footerNote.x}px, ${state.elements.footerNote.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('footerNote', e)}
          >
            <p className="footer-disclaimer" style={{ color: state.elements.footerNote.color, fontSize: `${state.elements.footerNote.fontSize || 11}px` }}>
              {state.elements.footerNote.text}
            </p>
            {isInteractive && selectedId === 'footerNote' && (
              <span className="coord-chip">X: {state.elements.footerNote.x} Y: {state.elements.footerNote.y}</span>
            )}
          </div>
        )}

        {/* 13. Stub Event Summary */}
        {state.elements.stubEventSummary?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'stubEventSummary' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.stubEventSummary.x}px, ${state.elements.stubEventSummary.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('stubEventSummary', e)}
          >
            <div className="stub-event-summary-block" style={{ ...getElementBoxStyle(state.elements.stubEventSummary) }}>
              <span className="stub-event-badge" style={{ color: state.elements.stubEventSummary.secondaryColor || '#64748b' }}>
                {state.elements.stubEventSummary.secondaryText || 'ADMISSION STUB'}
              </span>
              <strong className="stub-event-title" style={{ color: state.elements.stubEventSummary.color, fontSize: `${state.elements.stubEventSummary.fontSize || 12}px` }}>
                {state.elements.stubEventSummary.text}
              </strong>
            </div>
            {isInteractive && selectedId === 'stubEventSummary' && (
              <span className="coord-chip">X: {state.elements.stubEventSummary.x} Y: {state.elements.stubEventSummary.y}</span>
            )}
          </div>
        )}

        {/* 14. QR Code */}
        {state.elements.qrCode?.visible && (
          <div
            className={`movable-item qr-movable-box ${isInteractive && selectedId === 'qrCode' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.qrCode.x}px, ${state.elements.qrCode.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('qrCode', e)}
          >
            <button
              type="button"
              className="surface-qr-btn"
              style={{
                backgroundColor: state.qrBgColor,
                width: `${state.qrSize}px`,
                height: `${state.qrSize}px`,
                borderRadius: '12px',
                padding: '8px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSimulatedScanResult(state.qrPayload);
              }}
              title="คลิกเพื่อทดสอบผลการสแกน QR"
            >
              {/* biome-ignore lint/performance/noImgElement: direct rendered SVG QR */}
              <img
                src={qrSvgDataUrl}
                alt="Ticket QR Code"
                style={{ width: '100%', height: '100%', display: 'block', borderRadius: '8px' }}
              />
            </button>
            {isInteractive && selectedId === 'qrCode' && (
              <span className="coord-chip">X: {state.elements.qrCode.x} Y: {state.elements.qrCode.y}</span>
            )}
          </div>
        )}

        {/* 15. Code Under QR */}
        {state.elements.qrCodeLabel?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'qrCodeLabel' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.qrCodeLabel.x}px, ${state.elements.qrCodeLabel.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('qrCodeLabel', e)}
          >
            <div className="stub-code-block" style={{ ...getElementBoxStyle(state.elements.qrCodeLabel) }}>
              <span className="stub-code-tag" style={{ color: state.elements.qrCodeLabel.secondaryColor || '#64748b' }}>
                {state.elements.qrCodeLabel.secondaryText || 'รหัสอ้างอิงบัตร'}
              </span>
              <strong className="stub-code-strong font-mono" style={{ color: state.elements.qrCodeLabel.color }}>
                {state.elements.qrCodeLabel.text}
              </strong>
            </div>
            {isInteractive && selectedId === 'qrCodeLabel' && (
              <span className="coord-chip">X: {state.elements.qrCodeLabel.x} Y: {state.elements.qrCodeLabel.y}</span>
            )}
          </div>
        )}

        {/* 16. Scan Hint */}
        {state.elements.scanHint?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'scanHint' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.scanHint.x}px, ${state.elements.scanHint.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('scanHint', e)}
          >
            <span className="stub-scan-caption" style={{ color: state.elements.scanHint.color, fontSize: `${state.elements.scanHint.fontSize || 11}px` }}>
              {state.elements.scanHint.text}
            </span>
            {isInteractive && selectedId === 'scanHint' && (
              <span className="coord-chip">X: {state.elements.scanHint.x} Y: {state.elements.scanHint.y}</span>
            )}
          </div>
        )}

        {/* 17. Order ID */}
        {state.elements.orderId?.visible && (
          <div
            className={`movable-item ${isInteractive && selectedId === 'orderId' ? 'is-selected' : ''}`}
            style={{
              transform: `translate(${state.elements.orderId.x}px, ${state.elements.orderId.y}px)`,
            }}
            onPointerDown={(e) => handlePointerDown('orderId', e)}
          >
            <div className="stub-code-block" style={{ ...getElementBoxStyle(state.elements.orderId) }}>
              <span className="stub-code-tag" style={{ color: state.elements.orderId.secondaryColor || '#64748b' }}>
                {state.elements.orderId.secondaryText || 'ORDER ID'}
              </span>
              <span className="font-mono" style={{ color: state.elements.orderId.color, fontSize: `${state.elements.orderId.fontSize || 11}px` }}>
                {state.elements.orderId.text}
              </span>
            </div>
            {isInteractive && selectedId === 'orderId' && (
              <span className="coord-chip">X: {state.elements.orderId.x} Y: {state.elements.orderId.y}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={studioRootRef}
      className={`fullscreen-ticket-studio ${isFullscreen ? 'mode-fullscreen' : ''}`}
      data-testid="admin-ticket-designer"
    >
      {/* 1. Slim Studio Topbar */}
      <header className="studio-topbar">
        <div className="studio-brand-group">
          <div className="studio-badge">
            <SlidersIcon style={{ width: 14, height: 14 }} />
            <span>Studio</span>
          </div>
          <h1 className="studio-title">ออกแบบบัตรคอนเสิร์ต (Ticket Designer)</h1>
          <span className="studio-format-tag">ขนาดมาตรฐาน 1200 x 500 px (แนวนอน)</span>
        </div>

        {/* View Mode Switcher */}
        <nav className="studio-view-modes" aria-label="สลับมุมมอง">
          <button
            type="button"
            className={`studio-view-mode-btn ${viewMode === 'studio' ? 'active' : ''}`}
            onClick={() => setViewMode('studio')}
            title="โหมดสตูดิโอออกแบบ ลากวางชิ้นส่วนอย่างอิสระ"
          >
            <span>สตูดิโอออกแบบ</span>
          </button>
          <button
            type="button"
            className={`studio-view-mode-btn ${viewMode === 'mobile' ? 'active' : ''}`}
            onClick={() => setViewMode('mobile')}
            title="มุมมองในมือถือลูกค้า แสดงหน้าค้นหาบัตรของฉัน"
          >
            <span>มุมมองมือถือลูกค้า</span>
          </button>
          <button
            type="button"
            className={`studio-view-mode-btn ${viewMode === 'print' ? 'active' : ''}`}
            onClick={() => setViewMode('print')}
            title="มุมมองสำหรับพิมพ์บัตรบนกระดาษ A4"
          >
            <span>มุมมองพิมพ์บัตร</span>
          </button>
        </nav>

        {/* Preset Switcher Pills */}
        <nav className="studio-preset-pills" aria-label="พรีเซ็ตสำเร็จรูป">
          {Object.entries(PRESETS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              className={`studio-preset-pill ${state.presetId === key ? 'active' : ''}`}
              onClick={() => handleApplyPreset(key)}
            >
              {state.presetId === key && <CheckIcon style={{ width: 12, height: 12 }} />}
              <span>{p.name.split(' (')[0]}</span>
            </button>
          ))}
        </nav>

        {/* Top Actions */}
        <div className="studio-top-actions">
          {/* Master Template Save Button */}
          <button
            type="button"
            className="studio-btn save-master"
            onClick={handleSaveMasterTemplate}
            title="บันทึกการจัดวางและรูปแบบนี้เป็นแบบบัตรหลักมาตรฐานของทั้งระบบ"
          >
            <CheckIcon style={{ width: 15, height: 15 }} />
            <span>บันทึกแบบบัตรหลัก</span>
          </button>

          <button
            type="button"
            className="studio-btn secondary"
            onClick={handleLoadMasterTemplate}
            title="โหลดแบบบัตรหลักที่บันทึกไว้ล่าสุด"
          >
            <span>โหลดแบบบัตรหลัก</span>
          </button>

          <button
            type="button"
            className="studio-btn secondary"
            onClick={handleResetPositions}
            title="รีเซ็ตตำแหน่งกลับเป็นค่ามาตรฐานเริ่มต้น"
          >
            <RefreshIcon style={{ width: 15, height: 15 }} />
            <span>รีเซ็ตเริ่มต้น</span>
          </button>

          <button
            type="button"
            className="studio-btn secondary"
            onClick={() => setIsSidebarOpen((v) => !v)}
            title={isSidebarOpen ? 'ซ่อนแผงควบคุม' : 'เปิดแผงควบคุม'}
          >
            {isSidebarOpen ? <ChevronRightIcon style={{ width: 16, height: 16 }} /> : <ChevronLeftIcon style={{ width: 16, height: 16 }} />}
            <span>{isSidebarOpen ? 'ซ่อนเมนู' : 'เปิดเมนู'}</span>
          </button>

          <button
            type="button"
            className="studio-btn secondary"
            onClick={handleToggleFullscreen}
            title="สลับโหมดเต็มหน้าจอ"
          >
            <span>{isFullscreen ? 'ออกจากเต็มจอ' : 'เต็มหน้าจอ'}</span>
          </button>

          <button
            type="button"
            className="studio-btn primary"
            onClick={handleExportPng}
            disabled={isExporting}
            title="ดาวน์โหลดภาพบัตรความละเอียดสูง"
          >
            <DownloadIcon style={{ width: 15, height: 15 }} />
            <span>{isExporting ? 'กำลังสร้างไฟล์...' : 'ดาวน์โหลด PNG'}</span>
          </button>
        </div>
      </header>

      {/* Master Template Saved Toast */}
      {masterSavedToast && (
        <div className="studio-master-toast" role="status" aria-live="polite">
          <CheckIcon style={{ width: 18, height: 18, color: '#16a34a' }} />
          <span>{masterSavedToast}</span>
          <button type="button" className="toast-close-btn" onClick={() => setMasterSavedToast(null)}>
            ปิด
          </button>
        </div>
      )}

      {/* 2. Main Studio Viewport */}
      <div className="studio-main-viewport">
        {/* Central Drafting Canvas Stage with Dynamic Stage Style */}
        <main
          ref={stageRef}
          className="studio-canvas-stage"
          style={stageBackgroundStyle}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {viewMode === 'studio' && (
            <>
              {/* Backdrop click to deselect element */}
              <button
                type="button"
                className="stage-backdrop-clickarea"
                aria-label="ยกเลิกการเลือกชิ้นส่วน"
                onClick={() => setSelectedId(null)}
              />

              {/* Zoom / Scale Toolbar */}
              <div className="canvas-scale-dock">
                <div className="dock-mode-group">
                  <button
                    type="button"
                    className={`scale-pill-btn fit-btn ${zoomMode === 'fit' ? 'active' : ''}`}
                    onClick={() => setZoomMode('fit')}
                    title="ปรับขนาดอัตโนมัติให้เห็นภาพรวมบัตรทั้งใบ"
                  >
                    ภาพรวมเต็มใบ (Fit)
                  </button>
                </div>

                <div className="dock-divider" />

                <div className="dock-zoom-stepper">
                  <button
                    type="button"
                    className="zoom-step-btn"
                    onClick={() => {
                      setZoomMode('manual');
                      setManualScale((v) => Math.max(35, v - 15));
                    }}
                    title="ย่อขนาด"
                    aria-label="ย่อขนาด"
                  >
                    -
                  </button>
                  <div className="scale-pills">
                    {[50, 75, 100, 125].map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`scale-pill-btn ${zoomMode === 'manual' && manualScale === s ? 'active' : ''}`}
                        onClick={() => {
                          setZoomMode('manual');
                          setManualScale(s);
                        }}
                        title={s === 100 ? 'ขนาดจริง 100%' : `ซูม ${s}%`}
                      >
                        {s}%
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="zoom-step-btn"
                    onClick={() => {
                      setZoomMode('manual');
                      setManualScale((v) => Math.min(150, v + 15));
                    }}
                    title="ขยายขนาดดูรายละเอียด"
                    aria-label="ขยายขนาดดูรายละเอียด"
                  >
                    +
                  </button>
                </div>

                <span className="scale-current-tag">
                  {zoomMode === 'fit' ? `พอดีจอ (${fitScale}%)` : `ซูม ${manualScale}%`}
                </span>
              </div>

              {/* Scaled Layout Wrapper Box */}
              <div
                className="canvas-zoom-container"
                style={{
                  width: `${Math.round(1000 * (effectiveScale / 100))}px`,
                  height: `${Math.round(420 * (effectiveScale / 100))}px`,
                }}
              >
                {renderTicketCard(true)}
              </div>
            </>
          )}

          {viewMode === 'mobile' && (
            <div className="studio-mobile-device-mockup">
              <div className="mobile-notch-bar" />
              <div className="mobile-mockup-header">ค้นหาบัตรของฉัน (My Tickets View)</div>
              <div style={{ width: '100%', overflowX: 'auto', padding: '12px 0' }}>
                <div style={{ transform: 'scale(0.42)', transformOrigin: 'top left', width: '1000px', height: '420px', marginBottom: '-230px' }}>
                  {renderTicketCard(false)}
                </div>
              </div>
            </div>
          )}

          {viewMode === 'print' && (
            <div className="studio-print-preview-sheet">
              <div className="print-guide-text">
                ตัวอย่างสำหรับพิมพ์บัตรคอนเสิร์ต (Print Slip / A4 Cut Pass Preview)
              </div>
              <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
                {renderTicketCard(false)}
              </div>
            </div>
          )}

          {/* Test Scan Popup Result */}
          {simulatedScanResult && (
            <div className="studio-scan-toast" role="status" aria-live="polite">
              <CheckIcon style={{ width: 16, height: 16, color: '#16a34a' }} />
              <span>ผลการทดสอบสแกน QR: <strong>{simulatedScanResult}</strong></span>
              <button
                type="button"
                className="toast-close-btn"
                onClick={() => setSimulatedScanResult(null)}
              >
                ปิด
              </button>
            </div>
          )}
        </main>

        {/* 3. Collapsible Redesigned Menu Tabs Inspector Panel */}
        {isSidebarOpen && (
          <aside className="studio-side-panel">
            {/* Redesigned Clean Segmented Nav Tabs (5-Grid, Zero Overflow) */}
            <nav className="side-nav-tabs" aria-label="แท็บเมนูเครื่องมือ">
              <button
                type="button"
                className={`side-tab-btn ${activeSideTab === 'elements' ? 'active' : ''}`}
                onClick={() => setActiveSideTab('elements')}
                title="ปรับแต่งรายละเอียดชิ้นส่วนที่เลือก"
              >
                <SlidersIcon style={{ width: 15, height: 15 }} />
                <span>ชิ้นส่วน</span>
              </button>
              <button
                type="button"
                className={`side-tab-btn ${activeSideTab === 'cardBg' ? 'active' : ''}`}
                onClick={() => setActiveSideTab('cardBg')}
                title="พื้นหลังบัตร อัปโหลดรูปภาพทดสอบ และสีเนื้อกระดาษ"
              >
                <SparklesIcon style={{ width: 15, height: 15 }} />
                <span>พื้นหลังบัตร</span>
              </button>
              <button
                type="button"
                className={`side-tab-btn ${activeSideTab === 'stageBg' ? 'active' : ''}`}
                onClick={() => setActiveSideTab('stageBg')}
                title="ปรับแต่งสภาพแวดล้อมโต๊ะทำงาน / ฉากรอบบัตร เพื่อทดสอบความคมชัด"
              >
                <RefreshIcon style={{ width: 15, height: 15 }} />
                <span>ฉากหลัง</span>
              </button>
              <button
                type="button"
                className={`side-tab-btn ${activeSideTab === 'tearLine' ? 'active' : ''}`}
                onClick={() => setActiveSideTab('tearLine')}
                title="ตั้งค่าเส้นรอยปรุฉีกบัตรและฟอนต์ตัวอักษรหลัก"
              >
                <TicketIcon style={{ width: 15, height: 15 }} />
                <span>รอยปรุ</span>
              </button>
              <button
                type="button"
                className={`side-tab-btn ${activeSideTab === 'allElements' ? 'active' : ''}`}
                onClick={() => setActiveSideTab('allElements')}
                title="จัดการและเปิด/ปิดการแสดงผลเลเยอร์ทั้งหมด"
              >
                <EyeIcon style={{ width: 15, height: 15 }} />
                <span>เลเยอร์</span>
              </button>
            </nav>

            {/* TAB 1: ELEMENTS & CONTEXTUAL INSPECTOR */}
            {activeSideTab === 'elements' && (
              <div className="side-tab-content">
                {selectedItem ? (
                  <div className="inspector-card">
                    <div className="inspector-card-header">
                      <div className="inspector-card-header-top">
                        <span className="inspector-item-badge">กำลังแก้ไข</span>
                        <button
                          type="button"
                          className="hide-element-action-btn"
                          onClick={() => {
                            setState((prev) => ({
                              ...prev,
                              elements: {
                                ...prev.elements,
                                [selectedItem.id]: {
                                  ...prev.elements[selectedItem.id],
                                  visible: false,
                                },
                              },
                            }));
                            setSelectedId(null);
                          }}
                          title="ซ่อนชิ้นส่วนนี้ ไม่ให้แสดงบนบัตร"
                        >
                          <EyeOffIcon style={{ width: 13, height: 13 }} />
                          <span>ซ่อนชิ้นส่วนนี้ (ไม่ใช้งาน)</span>
                        </button>
                      </div>
                      <h3 className="inspector-item-title">{selectedItem.label}</h3>
                    </div>

                    {/* Text Content Editor */}
                    {selectedItem.text !== undefined && (
                      <div className="studio-field">
                        <label htmlFor={getFieldId('itemText')} className="studio-label">
                          ข้อความในชิ้นส่วน
                        </label>
                        <input
                          id={getFieldId('itemText')}
                          type="text"
                          className="studio-input"
                          value={selectedItem.text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setState((prev) => ({
                              ...prev,
                              elements: {
                                ...prev.elements,
                                [selectedItem.id]: {
                                  ...prev.elements[selectedItem.id],
                                  text: val,
                                },
                              },
                            }));
                          }}
                        />
                      </div>
                    )}

                    {/* Secondary Text / Subtitle */}
                    {selectedItem.secondaryText !== undefined && (
                      <div className="studio-field">
                        <label htmlFor={getFieldId('itemSecondaryText')} className="studio-label">
                          ข้อความกำกับส่วนหัว (Subtitle / Tag)
                        </label>
                        <input
                          id={getFieldId('itemSecondaryText')}
                          type="text"
                          className="studio-input"
                          value={selectedItem.secondaryText}
                          onChange={(e) => {
                            const val = e.target.value;
                            setState((prev) => ({
                              ...prev,
                              elements: {
                                ...prev.elements,
                                [selectedItem.id]: {
                                  ...prev.elements[selectedItem.id],
                                  secondaryText: val,
                                },
                              },
                            }));
                          }}
                        />
                      </div>
                    )}

                    {/* Secondary Text Color / Subtitle Color */}
                    {selectedItem.secondaryText !== undefined && (
                      <div className="studio-field">
                        <label htmlFor={getFieldId('itemSecondaryColor')} className="studio-label">
                          สีข้อความกำกับส่วนหัว (Subtitle / Tag Color)
                        </label>
                        <div className="studio-color-row">
                          <input
                            id={getFieldId('itemSecondaryColor')}
                            type="color"
                            value={selectedItem.secondaryColor || '#64748b'}
                            onChange={(e) => {
                              const val = e.target.value;
                              setState((prev) => ({
                                ...prev,
                                elements: {
                                  ...prev.elements,
                                  [selectedItem.id]: {
                                    ...prev.elements[selectedItem.id],
                                    secondaryColor: val,
                                  },
                                },
                              }));
                            }}
                          />
                          <input
                            type="text"
                            className="studio-input"
                            value={selectedItem.secondaryColor || '#64748b'}
                            onChange={(e) => {
                              const val = e.target.value;
                              setState((prev) => ({
                                ...prev,
                                elements: {
                                  ...prev.elements,
                                  [selectedItem.id]: {
                                    ...prev.elements[selectedItem.id],
                                    secondaryColor: val,
                                  },
                                },
                              }));
                            }}
                            aria-label="รหัสสีข้อความกำกับส่วนหัว"
                          />
                        </div>
                        <div className="color-swatches" style={{ marginTop: '0.35rem' }}>
                          {['#64748b', '#94a3b8', '#0f172a', '#334155', '#475569', '#78350f', '#0284c7', '#16a34a', '#dc2626'].map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              className="color-swatch-chip"
                              style={{ backgroundColor: hex }}
                              onClick={() => {
                                setState((prev) => ({
                                  ...prev,
                                  elements: {
                                    ...prev.elements,
                                    [selectedItem.id]: {
                                      ...prev.elements[selectedItem.id],
                                      secondaryColor: hex,
                                    },
                                  },
                                }));
                              }}
                              title={`เลือกสี ${hex}`}
                              aria-label={`สี ${hex}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Font Size */}
                    {selectedItem.fontSize !== undefined && (
                      <div className="studio-field">
                        <label htmlFor={getFieldId('itemFontSize')} className="studio-label">
                          ขนาดตัวอักษร ({selectedItem.fontSize}px)
                        </label>
                        <input
                          id={getFieldId('itemFontSize')}
                          type="range"
                          min={11}
                          max={44}
                          value={selectedItem.fontSize}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setState((prev) => ({
                              ...prev,
                              elements: {
                                ...prev.elements,
                                [selectedItem.id]: {
                                  ...prev.elements[selectedItem.id],
                                  fontSize: val,
                                },
                              },
                            }));
                          }}
                        />
                      </div>
                    )}

                    {/* Text Color */}
                    {selectedItem.color !== undefined && (
                      <div className="studio-field">
                        <label htmlFor={getFieldId('itemColor')} className="studio-label">สีตัวอักษร</label>
                        <div className="studio-color-row">
                          <input
                            id={getFieldId('itemColor')}
                            type="color"
                            value={selectedItem.color}
                            onChange={(e) => {
                              const val = e.target.value;
                              setState((prev) => ({
                                ...prev,
                                elements: {
                                  ...prev.elements,
                                  [selectedItem.id]: {
                                    ...prev.elements[selectedItem.id],
                                    color: val,
                                  },
                                },
                              }));
                            }}
                          />
                          <input
                            type="text"
                            className="studio-input"
                            value={selectedItem.color}
                            onChange={(e) => {
                              const val = e.target.value;
                              setState((prev) => ({
                                ...prev,
                                elements: {
                                  ...prev.elements,
                                  [selectedItem.id]: {
                                    ...prev.elements[selectedItem.id],
                                    color: val,
                                  },
                                },
                              }));
                            }}
                            aria-label="รหัสสีตัวอักษร"
                          />
                        </div>
                      </div>
                    )}

                    {/* Background & Border for Zone Badge and All Elements */}
                    {selectedItem.id !== 'qrCode' && (
                      <div className="studio-field" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <label htmlFor={getFieldId('itemBgColor')} className="studio-label" style={{ margin: 0 }}>
                            {selectedItem.id === 'zoneBadge' ? 'สีพื้นหลังป้ายโซน (Zone Background)' : 'สีพื้นหลังกล่องชิ้นส่วน (Box Background)'}
                          </label>
                          <button
                            type="button"
                            className={`studio-btn secondary ${(!selectedItem.bgColor || selectedItem.bgColor === 'transparent') ? 'active' : ''}`}
                            style={{ height: '26px', padding: '0 0.5rem', fontSize: '0.72rem' }}
                            onClick={() => {
                              const isCurrentlyTransparent = !selectedItem.bgColor || selectedItem.bgColor === 'transparent';
                              const nextBg = isCurrentlyTransparent ? '#0f172a' : 'transparent';
                              setState((prev) => ({
                                ...prev,
                                elements: {
                                  ...prev.elements,
                                  [selectedItem.id]: {
                                    ...prev.elements[selectedItem.id],
                                    bgColor: nextBg,
                                    color: (nextBg === 'transparent' && selectedItem.id === 'zoneBadge' && selectedItem.color === '#ffffff') ? '#0f172a' : selectedItem.color,
                                  },
                                },
                              }));
                            }}
                          >
                            {(!selectedItem.bgColor || selectedItem.bgColor === 'transparent') ? 'พื้นหลัง: โปร่งใส' : 'ปรับเป็นโปร่งใส'}
                          </button>
                        </div>

                        <div className="studio-color-row">
                          <input
                            id={getFieldId('itemBgColor')}
                            type="color"
                            value={selectedItem.bgColor && selectedItem.bgColor !== 'transparent' ? selectedItem.bgColor : '#0f172a'}
                            onChange={(e) => {
                              const val = e.target.value;
                              setState((prev) => ({
                                ...prev,
                                elements: {
                                  ...prev.elements,
                                  [selectedItem.id]: {
                                    ...prev.elements[selectedItem.id],
                                    bgColor: val,
                                  },
                                },
                              }));
                            }}
                          />
                          <input
                            type="text"
                            className="studio-input"
                            value={selectedItem.bgColor || 'transparent'}
                            onChange={(e) => {
                              const val = e.target.value;
                              setState((prev) => ({
                                ...prev,
                                elements: {
                                  ...prev.elements,
                                  [selectedItem.id]: {
                                    ...prev.elements[selectedItem.id],
                                    bgColor: val,
                                  },
                                },
                              }));
                            }}
                            placeholder="transparent หรือ #0f172a"
                            aria-label="รหัสสีพื้นหลัง"
                          />
                        </div>

                        <div className="color-swatches" style={{ marginTop: '0.35rem' }}>
                          <button
                            type="button"
                            className={`color-swatch-chip transparent-swatch ${(!selectedItem.bgColor || selectedItem.bgColor === 'transparent') ? 'active' : ''}`}
                            onClick={() => {
                              setState((prev) => ({
                                ...prev,
                                elements: {
                                  ...prev.elements,
                                  [selectedItem.id]: {
                                    ...prev.elements[selectedItem.id],
                                    bgColor: 'transparent',
                                    color: (selectedItem.id === 'zoneBadge' && selectedItem.color === '#ffffff') ? '#0f172a' : selectedItem.color,
                                  },
                                },
                              }));
                            }}
                            title="โปร่งใส (ไม่มีพื้นหลัง)"
                            aria-label="โปร่งใส (ไม่มีพื้นหลัง)"
                          >
                            <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748b' }}>None</span>
                          </button>
                          {['#0f172a', '#ffffff', '#f1f5f9', '#e2e8f0', '#0284c7', '#9a3412', '#16a34a', '#d97706', '#991b1b'].map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              className="color-swatch-chip"
                              style={{ backgroundColor: hex }}
                              onClick={() => {
                                setState((prev) => ({
                                  ...prev,
                                  elements: {
                                    ...prev.elements,
                                    [selectedItem.id]: {
                                      ...prev.elements[selectedItem.id],
                                      bgColor: hex,
                                    },
                                  },
                                }));
                              }}
                              title={`เลือกสี ${hex}`}
                              aria-label={`สี ${hex}`}
                            />
                          ))}
                        </div>

                        {/* Border / Outline for Zone Badge & All Parts */}
                        <div style={{ marginTop: '0.65rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                            <label htmlFor={getFieldId('itemBorderColor')} className="studio-label" style={{ margin: 0 }}>
                              สีกรอบ / เส้นขอบ (Border / Outline)
                            </label>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              หนา {selectedItem.borderWidth ?? (selectedItem.borderColor && selectedItem.borderColor !== 'transparent' ? 1 : 0)}px
                            </span>
                          </div>

                          <div className="studio-color-row">
                            <input
                              id={getFieldId('itemBorderColor')}
                              type="color"
                              value={selectedItem.borderColor && selectedItem.borderColor !== 'transparent' ? selectedItem.borderColor : '#0f172a'}
                              onChange={(e) => {
                                const val = e.target.value;
                                setState((prev) => ({
                                  ...prev,
                                  elements: {
                                    ...prev.elements,
                                    [selectedItem.id]: {
                                      ...prev.elements[selectedItem.id],
                                      borderColor: val,
                                      borderWidth: prev.elements[selectedItem.id].borderWidth || 1,
                                    },
                                  },
                                }));
                              }}
                            />
                            <input
                              type="text"
                              className="studio-input"
                              value={selectedItem.borderColor || 'transparent'}
                              onChange={(e) => {
                                const val = e.target.value;
                                setState((prev) => ({
                                  ...prev,
                                  elements: {
                                    ...prev.elements,
                                    [selectedItem.id]: {
                                      ...prev.elements[selectedItem.id],
                                      borderColor: val,
                                      borderWidth: val !== 'transparent' ? (prev.elements[selectedItem.id].borderWidth || 1) : 0,
                                    },
                                  },
                                }));
                              }}
                              placeholder="transparent หรือ #0f172a"
                              aria-label="รหัสสีกรอบ"
                            />
                          </div>

                          <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem' }}>
                            {[
                              { label: 'ไม่มีกรอบ', width: 0, color: 'transparent' },
                              { label: 'กรอบบาง (1px)', width: 1, color: selectedItem.borderColor && selectedItem.borderColor !== 'transparent' ? selectedItem.borderColor : '#0f172a' },
                              { label: 'กรอบหนา (2px)', width: 2, color: selectedItem.borderColor && selectedItem.borderColor !== 'transparent' ? selectedItem.borderColor : '#0f172a' },
                            ].map((b) => {
                              const isCurrent = (selectedItem.borderWidth ?? 0) === b.width;
                              return (
                                <button
                                  key={b.width}
                                  type="button"
                                  className={`studio-btn secondary ${isCurrent ? 'active' : ''}`}
                                  style={{ height: '26px', padding: '0 0.5rem', fontSize: '0.72rem', flex: 1 }}
                                  onClick={() => {
                                    setState((prev) => ({
                                      ...prev,
                                      elements: {
                                        ...prev.elements,
                                        [selectedItem.id]: {
                                          ...prev.elements[selectedItem.id],
                                          borderWidth: b.width,
                                          borderColor: b.color,
                                        },
                                      },
                                    }));
                                  }}
                                >
                                  {b.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* QR Code Size & Colors if QR is selected */}
                    {selectedItem.id === 'qrCode' && (
                      <>
                        <div className="studio-field">
                          <label htmlFor={getFieldId('qrSizeVal')} className="studio-label">
                            ขนาดคิวอาร์โค้ด ({state.qrSize}px)
                          </label>
                          <input
                            id={getFieldId('qrSizeVal')}
                            type="range"
                            min={110}
                            max={230}
                            value={state.qrSize}
                            onChange={(e) => setState((prev) => ({ ...prev, qrSize: Number(e.target.value) }))}
                          />
                        </div>

                        <div className="studio-field">
                          <label htmlFor={getFieldId('qrPayloadVal')} className="studio-label">
                            ข้อความจำลองใน QR (สูงสุด 62 ตัวอักษร)
                          </label>
                          <input
                            id={getFieldId('qrPayloadVal')}
                            type="text"
                            className="studio-input"
                            maxLength={62}
                            value={state.qrPayload}
                            onChange={(e) => setState((prev) => ({ ...prev, qrPayload: e.target.value }))}
                          />
                        </div>
                      </>
                    )}

                    {/* Precision Coordinates X & Y */}
                    <div className="studio-grid-2">
                      <div className="studio-field">
                        <label htmlFor={getFieldId('itemCoordX')} className="studio-label">พิกัด X (px)</label>
                        <input
                          id={getFieldId('itemCoordX')}
                          type="number"
                          className="studio-input"
                          min={0}
                          max={950}
                          value={selectedItem.x}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setState((prev) => ({
                              ...prev,
                              elements: {
                                ...prev.elements,
                                [selectedItem.id]: {
                                  ...prev.elements[selectedItem.id],
                                  x: val,
                                },
                              },
                            }));
                          }}
                        />
                      </div>
                      <div className="studio-field">
                        <label htmlFor={getFieldId('itemCoordY')} className="studio-label">พิกัด Y (px)</label>
                        <input
                          id={getFieldId('itemCoordY')}
                          type="number"
                          className="studio-input"
                          min={0}
                          max={390}
                          value={selectedItem.y}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setState((prev) => ({
                              ...prev,
                              elements: {
                                ...prev.elements,
                                [selectedItem.id]: {
                                  ...prev.elements[selectedItem.id],
                                  y: val,
                                },
                              },
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="inspector-empty-state">
                    <SlidersIcon style={{ width: 28, height: 28, color: '#64748b' }} />
                    <h4>โครงสร้างองค์ประกอบบัตรคอนเสิร์ต</h4>
                    <p>คลิกเลือกชิ้นส่วนบนบัตรเพื่อลากย้าย หรือเลือกจากหมวดหมู่โครงสร้างด้านล่าง:</p>
                    <div className="inspector-sections-list">
                      {SECTIONS_DIRECTORY.map((sec) => (
                        <div key={sec.id} className="inspector-section-card">
                          <h5 className="section-card-title">{sec.name}</h5>
                          <div className="section-card-items">
                            {sec.itemIds.map((itemId) => {
                              const item = state.elements[itemId];
                              if (!item) return null;
                              return (
                                <div
                                  key={itemId}
                                  className={`section-quick-item-pill-group ${!item.visible ? 'is-hidden-pill' : ''}`}
                                >
                                  <button
                                    type="button"
                                    className={`section-quick-item-btn ${!item.visible ? 'is-hidden' : ''}`}
                                    onClick={() => setSelectedId(itemId)}
                                    title={`คลิกเพื่อเลือกแก้ไข ${item.label.split(' (')[0]}`}
                                  >
                                    {item.label.split(' (')[0]}
                                  </button>
                                  <button
                                    type="button"
                                    className={`quick-item-eye-btn ${!item.visible ? 'is-hidden' : ''}`}
                                    onClick={() => {
                                      setState((prev) => ({
                                        ...prev,
                                        elements: {
                                          ...prev.elements,
                                          [itemId]: {
                                            ...prev.elements[itemId],
                                            visible: !prev.elements[itemId].visible,
                                          },
                                        },
                                      }));
                                    }}
                                    title={item.visible ? 'คลิกเพื่อซ่อนชิ้นส่วนนี้' : 'คลิกเพื่อแสดงชิ้นส่วนนี้'}
                                    aria-label={`${item.visible ? 'ซ่อน' : 'แสดง'} ${item.label.split(' (')[0]}`}
                                  >
                                    {item.visible ? (
                                      <EyeIcon style={{ width: 12, height: 12 }} />
                                    ) : (
                                      <EyeOffIcon style={{ width: 12, height: 12, color: '#94a3b8' }} />
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: TICKET CARD BACKGROUND & TEST IMAGE FILE UPLOAD */}
            {activeSideTab === 'cardBg' && (
              <div className="side-tab-content">
                <div className="studio-field">
                  <label htmlFor={getFieldId('bgTypeSelect')} className="studio-label">
                    โหมดพื้นหลังบัตร (Cardstock Mode)
                  </label>
                  <select
                    id={getFieldId('bgTypeSelect')}
                    className="studio-select"
                    value={state.bgType}
                    onChange={(e) => setState((prev) => ({ ...prev, bgType: e.target.value as BackgroundType }))}
                  >
                    <option value="solid">สีพื้นหลังการ์ดเรียบ (Solid Cardstock)</option>
                    <option value="image">อัปโหลดรูปภาพทดสอบพื้นหลังบัตร (Image File Upload)</option>
                    <option value="gradient">ไล่เฉดสี (Gradient)</option>
                    <option value="pattern">ลวดลายเท็กซ์เจอร์ (Pattern Texture)</option>
                  </select>
                </div>

                {/* Solid Color */}
                {state.bgType === 'solid' && (
                  <div className="studio-field">
                    <label htmlFor={getFieldId('solidColorInput')} className="studio-label">สีพื้นหลังบัตร</label>
                    <div className="studio-color-row">
                      <input
                        id={getFieldId('solidColorInput')}
                        type="color"
                        value={state.bgColor}
                        onChange={(e) => setState((prev) => ({ ...prev, bgColor: e.target.value }))}
                      />
                      <input
                        type="text"
                        className="studio-input"
                        value={state.bgColor}
                        onChange={(e) => setState((prev) => ({ ...prev, bgColor: e.target.value }))}
                        aria-label="รหัสสีพื้นหลัง"
                      />
                    </div>
                    <div className="color-swatches">
                      {['#ffffff', '#f8fafc', '#f1f5f9', '#f4ede4', '#111827', '#18181b', '#0f172a'].map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          className="color-swatch-chip"
                          style={{ backgroundColor: hex }}
                          onClick={() => setState((prev) => ({ ...prev, bgColor: hex }))}
                          aria-label={`สี ${hex}`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Test Image File Upload for Ticket Card */}
                {state.bgType === 'image' && (
                  <div className="studio-image-box">
                    <div className="studio-field">
                      <span className="studio-label">อัปโหลดไฟล์รูปภาพทดสอบพื้นหลังบัตร</span>
                      {/* Hidden file input */}
                      <input
                        id={getFieldId('uploadBgFile')}
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleTicketImageUpload}
                      />

                      {/* Dropzone */}
                      <button
                        type="button"
                        className={`ticket-upload-dropzone ${isDragOverDropzone ? 'dragover' : ''}`}
                        onDragOver={handleDropzoneDragOver}
                        onDragLeave={handleDropzoneDragLeave}
                        onDrop={handleDropzoneDrop}
                        onClick={() => fileInputRef.current?.click()}
                        aria-label="อัปโหลดรูปภาพทดสอบพื้นหลังบัตร"
                      >
                        <div className="dropzone-icon-box">
                          <DownloadIcon style={{ width: 18, height: 18 }} />
                        </div>
                        <span className="dropzone-prompt">คลิกเพื่อเลือกไฟล์รูปภาพ หรือลากมาวาง</span>
                        <span className="dropzone-hint">รองรับ PNG, JPG, WebP ทุกขนาด</span>
                      </button>
                    </div>

                    {/* Uploaded Thumbnail & Remove Option */}
                    {state.bgImageUrl && (
                      <div className="ticket-upload-preview">
                        <div className="preview-left-group">
                          {/* biome-ignore lint/performance/noImgElement: background thumbnail */}
                          <img src={state.bgImageUrl} alt="Card Background" className="ticket-upload-thumbnail" />
                          <span className="preview-file-tag">ใช้รูปนี้เป็นพื้นหลังบัตร</span>
                        </div>
                        <button
                          type="button"
                          className="studio-btn secondary"
                          style={{ height: '28px', padding: '0 0.5rem', fontSize: '0.72rem' }}
                          onClick={handleClearCardImage}
                        >
                          คืนค่าบัตรขาว
                        </button>
                      </div>
                    )}

                    <div className="studio-field">
                      <label htmlFor={getFieldId('imageUrlText')} className="studio-label">หรือระบุ URL รูปภาพ</label>
                      <input
                        id={getFieldId('imageUrlText')}
                        type="url"
                        className="studio-input"
                        placeholder="https://example.com/poster.jpg"
                        value={state.bgImageUrl}
                        onChange={(e) => setState((prev) => ({ ...prev, bgImageUrl: e.target.value }))}
                      />
                    </div>

                    <span className="sample-label">คลิกทดสอบภาพเวทีจริง:</span>
                    <div className="sample-grid-2">
                      {SAMPLE_BACKGROUNDS.map((bg) => (
                        <button
                          key={bg.name}
                          type="button"
                          className="sample-stage-card"
                          onClick={() => setState((prev) => ({ ...prev, bgType: 'image', bgImageUrl: bg.url }))}
                        >
                          {/* biome-ignore lint/performance/noImgElement: background thumbnail */}
                          <img src={bg.url} alt={bg.name} />
                          <span>{bg.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gradient */}
                {state.bgType === 'gradient' && (
                  <>
                    <div className="studio-grid-2">
                      <div className="studio-field">
                        <label htmlFor={getFieldId('gradStart')} className="studio-label">สีเริ่มต้น</label>
                        <input
                          id={getFieldId('gradStart')}
                          type="color"
                          value={state.gradientStart}
                          onChange={(e) => setState((prev) => ({ ...prev, gradientStart: e.target.value }))}
                        />
                      </div>
                      <div className="studio-field">
                        <label htmlFor={getFieldId('gradEnd')} className="studio-label">สีสิ้นสุด</label>
                        <input
                          id={getFieldId('gradEnd')}
                          type="color"
                          value={state.gradientEnd}
                          onChange={(e) => setState((prev) => ({ ...prev, gradientEnd: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="studio-field">
                      <label htmlFor={getFieldId('gradAngle')} className="studio-label">
                        มุมการไล่เฉด ({state.gradientAngle}°)
                      </label>
                      <input
                        id={getFieldId('gradAngle')}
                        type="range"
                        min={0}
                        max={360}
                        value={state.gradientAngle}
                        onChange={(e) => setState((prev) => ({ ...prev, gradientAngle: Number(e.target.value) }))}
                      />
                    </div>
                  </>
                )}

                {/* Pattern */}
                {state.bgType === 'pattern' && (
                  <div className="studio-field">
                    <label htmlFor={getFieldId('patternSelect')} className="studio-label">เลือกลวดลาย</label>
                    <select
                      id={getFieldId('patternSelect')}
                      className="studio-select"
                      value={state.patternType}
                      onChange={(e) =>
                        setState((prev) => ({
                          ...prev,
                          patternType: e.target.value as 'none' | 'dots' | 'grid' | 'stripes',
                        }))
                      }
                    >
                      <option value="dots">จุดกลมสลับ (Subtle Dots)</option>
                      <option value="grid">ตารางเส้นบาง (Modern Grid)</option>
                      <option value="stripes">ลายเส้นเฉียง (Diagonal Stripes)</option>
                      <option value="none">ไม่มีลาย</option>
                    </select>
                  </div>
                )}

                {/* Contrast Overlays */}
                <div className="studio-field" style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                  <label htmlFor={getFieldId('darknessVal')} className="studio-label">
                    ความมืดเลเยอร์ทับฉากหลัง ({state.bgOverlayDarkness}%)
                  </label>
                  <input
                    id={getFieldId('darknessVal')}
                    type="range"
                    min={0}
                    max={90}
                    value={state.bgOverlayDarkness}
                    onChange={(e) => setState((prev) => ({ ...prev, bgOverlayDarkness: Number(e.target.value) }))}
                  />
                </div>

                <div className="studio-field">
                  <label htmlFor={getFieldId('blurVal')} className="studio-label">
                    ความเบลอฉากหลัง ({state.bgOverlayBlur}px)
                  </label>
                  <input
                    id={getFieldId('blurVal')}
                    type="range"
                    min={0}
                    max={12}
                    value={state.bgOverlayBlur}
                    onChange={(e) => setState((prev) => ({ ...prev, bgOverlayBlur: Number(e.target.value) }))}
                  />
                </div>
              </div>
            )}

            {/* TAB 3: WORKSPACE STAGE BACKGROUND (โต๊ะทำงาน ไม่ใช่บัตร) */}
            {activeSideTab === 'stageBg' && (
              <div className="side-tab-content">
                <div className="studio-field">
                  <span className="studio-label">เลือกรูปแบบพื้นหลังโต๊ะเขียนแบบ (Workspace Stage)</span>
                  <p className="dropzone-hint" style={{ margin: '0 0 0.5rem 0' }}>
                    ปรับสภาพแวดล้อมรอบตัวบัตรเพื่อทดสอบความคมชัดและมิติการมองเห็น (ไม่กระทบต่อตัวบัตรจริง)
                  </p>
                  <div className="stage-style-grid">
                    <button
                      type="button"
                      className={`stage-style-card ${workspaceStage.style === 'dots' ? 'active' : ''}`}
                      onClick={() => setWorkspaceStage((prev) => ({ ...prev, style: 'dots' }))}
                    >
                      <span className="stage-style-title">จุดกริดเขียนแบบ</span>
                      <span className="stage-style-desc">ลายจุดสไตล์โต๊ะดราฟต์</span>
                    </button>
                    <button
                      type="button"
                      className={`stage-style-card ${workspaceStage.style === 'white' ? 'active' : ''}`}
                      onClick={() => setWorkspaceStage((prev) => ({ ...prev, style: 'white' }))}
                    >
                      <span className="stage-style-title">สีขาวสว่าง</span>
                      <span className="stage-style-desc">โต๊ะสีขาวบริสุทธิ์</span>
                    </button>
                    <button
                      type="button"
                      className={`stage-style-card ${workspaceStage.style === 'light-slate' ? 'active' : ''}`}
                      onClick={() => setWorkspaceStage((prev) => ({ ...prev, style: 'light-slate' }))}
                    >
                      <span className="stage-style-title">สเลทนวลตา</span>
                      <span className="stage-style-desc">สีเทาอ่อน #f1f5f9</span>
                    </button>
                    <button
                      type="button"
                      className={`stage-style-card ${workspaceStage.style === 'grid' ? 'active' : ''}`}
                      onClick={() => setWorkspaceStage((prev) => ({ ...prev, style: 'grid' }))}
                    >
                      <span className="stage-style-title">ตารางสเกล</span>
                      <span className="stage-style-desc">เส้นตารางมิลลิเมตร</span>
                    </button>
                    <button
                      type="button"
                      className={`stage-style-card ${workspaceStage.style === 'dark-neutral' ? 'active' : ''}`}
                      onClick={() => setWorkspaceStage((prev) => ({ ...prev, style: 'dark-neutral' }))}
                    >
                      <span className="stage-style-title">คอนทราสต์เข้ม</span>
                      <span className="stage-style-desc">สีสเลทเข้มตัดขอบ</span>
                    </button>
                  </div>
                </div>

                <div className="studio-field" style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                  <label htmlFor={getFieldId('customStageColor')} className="studio-label">
                    สีพื้นหลังโต๊ะเขียนแบบแบบกำหนดเอง
                  </label>
                  <div className="studio-color-row">
                    <input
                      id={getFieldId('customStageColor')}
                      type="color"
                      value={workspaceStage.customColor}
                      onChange={(e) => setWorkspaceStage((prev) => ({ ...prev, customColor: e.target.value }))}
                    />
                    <input
                      type="text"
                      className="studio-input"
                      value={workspaceStage.customColor}
                      onChange={(e) => setWorkspaceStage((prev) => ({ ...prev, customColor: e.target.value }))}
                      aria-label="รหัสสีพื้นหลังโต๊ะทำงาน"
                    />
                  </div>
                  <div className="color-swatches">
                    {['#f8fafc', '#ffffff', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#334155', '#0f172a'].map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        className="color-swatch-chip"
                        style={{ backgroundColor: hex }}
                        onClick={() => setWorkspaceStage((prev) => ({ ...prev, customColor: hex }))}
                        aria-label={`สี ${hex}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: TEAR LINE, BORDER & FONT */}
            {activeSideTab === 'tearLine' && (
              <div className="side-tab-content">
                <div className="studio-field">
                  <label htmlFor={getFieldId('tearStyle')} className="studio-label">รูปแบบรอยปรุ / เส้นตัด</label>
                  <select
                    id={getFieldId('tearStyle')}
                    className="studio-select"
                    value={state.tearLineStyle}
                    onChange={(e) => setState((prev) => ({ ...prev, tearLineStyle: e.target.value as TearLineStyle }))}
                  >
                    <option value="dashed">เส้นประมาตรฐาน (Dashed)</option>
                    <option value="notched">รอยบากเจาะรูครึ่งวงกลม (Ticket Notches)</option>
                    <option value="dotted">เส้นจุดไข่ปลา (Dotted)</option>
                    <option value="solid">เส้นทึบแบ่งส่วน (Solid)</option>
                    <option value="none">ไม่มีเส้นแบ่ง (None)</option>
                  </select>
                </div>

                <div className="studio-field">
                  <label htmlFor={getFieldId('tearXVal')} className="studio-label">
                    ตำแหน่งเส้นรอยปรุแนวนอน ({state.tearLineX}px)
                  </label>
                  <input
                    id={getFieldId('tearXVal')}
                    type="range"
                    min={550}
                    max={850}
                    value={state.tearLineX}
                    onChange={(e) => setState((prev) => ({ ...prev, tearLineX: Number(e.target.value) }))}
                  />
                </div>

                <div className="studio-field">
                  <label htmlFor={getFieldId('tearColor')} className="studio-label">สีเส้นรอยปรุ</label>
                  <input
                    id={getFieldId('tearColor')}
                    type="color"
                    value={state.tearLineColor}
                    onChange={(e) => setState((prev) => ({ ...prev, tearLineColor: e.target.value }))}
                  />
                </div>

                <div className="studio-field">
                  <label htmlFor={getFieldId('radiusVal')} className="studio-label">
                    ความโค้งมนขอบบัตร ({state.borderRadius}px)
                  </label>
                  <input
                    id={getFieldId('radiusVal')}
                    type="range"
                    min={0}
                    max={24}
                    value={state.borderRadius}
                    onChange={(e) => setState((prev) => ({ ...prev, borderRadius: Number(e.target.value) }))}
                  />
                </div>

                <div className="studio-field">
                  <label htmlFor={getFieldId('borderColor')} className="studio-label">สีขอบบัตร</label>
                  <input
                    id={getFieldId('borderColor')}
                    type="color"
                    value={state.borderColor}
                    onChange={(e) => setState((prev) => ({ ...prev, borderColor: e.target.value }))}
                  />
                </div>

                {/* Global Font Family */}
                <div className="studio-field" style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                  <label htmlFor={getFieldId('fontFamilySelect')} className="studio-label">ฟอนต์ตัวอักษรหลัก (Font Family)</label>
                  <select
                    id={getFieldId('fontFamilySelect')}
                    className="studio-select"
                    value={state.fontFamily}
                    onChange={(e) => setState((prev) => ({ ...prev, fontFamily: e.target.value as FontFamilyChoice }))}
                  >
                    <option value="Kanit">Kanit (มาตรฐานทันสมัย)</option>
                    <option value="Sarabun">Sarabun (ทางการ ชัดเจน)</option>
                    <option value="Prompt">Prompt (โมเดิร์น คมชัด)</option>
                    <option value="Chakra Petch">Chakra Petch (สปอร์ต ดิจิทัล)</option>
                  </select>
                </div>
              </div>
            )}

            {/* TAB 5: ALL ELEMENTS VISIBILITY CHECKLIST */}
            {activeSideTab === 'allElements' && (
              <div className="side-tab-content">
                <div className="layers-tab-header">
                  <span className="elements-list-hint">
                    เปิด/ปิด หรือเลือกชิ้นส่วนบนบัตร ({Object.values(state.elements).filter((e) => e.visible).length}/{Object.values(state.elements).length} ชิ้นส่วนกำลังแสดง):
                  </span>
                  <div className="layers-batch-actions">
                    <button
                      type="button"
                      className="layers-preset-btn"
                      onClick={() => {
                        setState((prev) => {
                          const updated = { ...prev.elements };
                          for (const key of Object.keys(updated)) {
                            updated[key] = { ...updated[key], visible: true };
                          }
                          return { ...prev, elements: updated };
                        });
                      }}
                      title="เปิดแสดงทุกชิ้นส่วนบนบัตร"
                    >
                      เปิดแสดงทั้งหมด
                    </button>
                    <button
                      type="button"
                      className="layers-preset-btn"
                      onClick={() => {
                        setState((prev) => ({
                          ...prev,
                          elements: {
                            ...prev.elements,
                            gateInfo: { ...prev.elements.gateInfo, visible: false },
                            seatInfo: { ...prev.elements.seatInfo, visible: false },
                            priceInfo: { ...prev.elements.priceInfo, visible: false },
                          },
                        }));
                      }}
                      title="ซ่อนข้อมูลประตู แถว/ที่นั่ง และราคา สำหรับบัตรยืนหรือเทศกาลดนตรี"
                    >
                      แบบบัตรยืน (ไม่ระบุที่นั่ง/ราคา)
                    </button>
                  </div>
                </div>
                <div className="elements-toggle-stack">
                  {Object.values(state.elements).map((el) => (
                    <div
                      key={el.id}
                      className={`element-row-item ${selectedId === el.id ? 'active' : ''} ${!el.visible ? 'is-dimmed' : ''}`}
                    >
                      <button
                        type="button"
                        className="element-row-name-btn"
                        onClick={() => {
                          setSelectedId(el.id);
                          setActiveSideTab('elements');
                        }}
                      >
                        {el.label}
                      </button>
                      <button
                        type="button"
                        className="element-eye-btn"
                        onClick={() => {
                          setState((prev) => ({
                            ...prev,
                            elements: {
                              ...prev.elements,
                              [el.id]: {
                                ...prev.elements[el.id],
                                visible: !prev.elements[el.id].visible,
                              },
                            },
                          }));
                        }}
                        title={el.visible ? 'ซ่อนชิ้นส่วน' : 'แสดงชิ้นส่วน'}
                      >
                        {el.visible ? <EyeIcon style={{ width: 14, height: 14 }} /> : <EyeOffIcon style={{ width: 14, height: 14, color: '#94a3b8' }} />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
