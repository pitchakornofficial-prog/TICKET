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
  ChevronUpIcon,
  ChevronDownIcon,
  XIcon,
} from '@/components/icons';
import { TicketIcon } from '@/components/ticket-icon';
import { generateCustomQrSvg } from '@/lib/ticket-qr';

export type TearLineStyle = 'dashed' | 'dotted' | 'notched' | 'solid' | 'none';
export type BackgroundType = 'solid' | 'gradient' | 'image';
export type FontFamilyChoice = string;
export type ElementSection = 'header' | 'event' | 'access' | 'schedule' | 'security' | 'stub' | 'footer';
export type DesignerTabId = 'elements' | 'layers' | 'card' | 'font' | 'cardBg' | 'stageBg' | 'tearLine' | 'allElements';
export type WorkspaceStageStyle = 'grid' | 'white' | 'dark-neutral' | 'dots' | 'light-slate';

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
  fontWeight?: string;
  secondaryFontSize?: number;
  secondaryFontWeight?: string;
  showSecondaryText?: boolean;
  color?: string;
  secondaryColor?: string;
  bgColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  text?: string;
  secondaryText?: string;
  size?: number; // for QR
  align?: 'left' | 'center' | 'right';
}

export interface TicketDesignerState {
  presetId: string;
  // Card Shape & Boundary (Forced Square Edges per D-289)
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  tearLineX: number; // 550 to 850 px
  tearLineStyle: TearLineStyle;
  tearLineColor: string;

  // Global Typography & Custom Font
  fontFamily: FontFamilyChoice;
  titleFontWeight?: number;
  bodyFontWeight?: number;
  customFontName?: string;
  customFontUrl?: string;

  // Layer Painting Order (index 0 = bottom-most, last = top-most)
  layerOrder?: string[];

  // Background & Testing
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

export const DEFAULT_LAYER_ORDER: string[] = [
  'brandLogo',
  'eventTitle',
  'zoneBadge',
  'gateInfo',
  'seatInfo',
  'priceInfo',
  'dateTime',
  'venue',
  'buyerName',
  'ticketCode',
  'barcode',
  'footerNote',
  'stubEventSummary',
  'qrCode',
  'qrCodeLabel',
  'scanHint',
  'orderId',
];

export const DEFAULT_WORKSPACE_STAGE: WorkspaceStageSettings = {
  style: 'grid',
  customColor: '#f8fafc',
};

export const DEFAULT_STATE: TicketDesignerState = {
  presetId: 'classic-white',
  borderRadius: 0,
  borderWidth: 0,
  borderColor: '#cbd5e1',
  tearLineX: 720,
  tearLineStyle: 'none',
  tearLineColor: '#94a3b8',

  fontFamily: 'Kanit',
  titleFontWeight: 400,
  bodyFontWeight: 400,
  customFontName: '',
  customFontUrl: '',
  layerOrder: DEFAULT_LAYER_ORDER,

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
      fontSize: 16,
      secondaryFontSize: 10,
      showSecondaryText: true,
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
      secondaryFontSize: 11,
      showSecondaryText: true,
      color: '#0f172a',
      secondaryColor: '#64748b',
      secondaryText: 'คอนเสิร์ต (CONCERT)',
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
      secondaryFontSize: 11,
      showSecondaryText: true,
      color: '#0f172a',
      secondaryColor: '#64748b',
      secondaryText: 'โซน / ประเภทบัตร (ZONE & CATEGORY)',
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
      secondaryFontSize: 11,
      showSecondaryText: true,
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
      secondaryFontSize: 11,
      showSecondaryText: true,
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
      secondaryFontSize: 11,
      showSecondaryText: true,
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
      secondaryFontSize: 11,
      showSecondaryText: true,
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
      secondaryFontSize: 11,
      showSecondaryText: true,
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
      secondaryFontSize: 11,
      showSecondaryText: true,
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
      secondaryFontSize: 11,
      showSecondaryText: true,
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
      fontSize: 10,
      secondaryFontSize: 10,
      showSecondaryText: true,
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
      secondaryFontSize: 10,
      showSecondaryText: false,
      color: '#64748b',
      secondaryColor: '#64748b',
      secondaryText: 'เงื่อนไขและข้อตกลง (POLICY)',
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
      secondaryFontSize: 10,
      showSecondaryText: true,
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
      secondaryFontSize: 10,
      showSecondaryText: true,
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
      secondaryFontSize: 10,
      showSecondaryText: false,
      color: '#64748b',
      secondaryColor: '#64748b',
      secondaryText: 'คำแนะนำ (INSTRUCTION)',
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
      secondaryFontSize: 10,
      showSecondaryText: true,
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

export const PRESETS: Record<string, { name: string; desc: string; apply: (s: TicketDesignerState) => TicketDesignerState }> = {
  'classic-white': {
    name: 'บัตรขาวทางการ (Official White)',
    desc: 'บัตรคอนเสิร์ตกระดาษอาร์ตการ์ดขาวสะอาด ขอบคมชัด ตัวหนังสือสีเข้มอ่านง่าย สไตล์บัตรทางการมาตรฐานสากล',
    apply: (s) => ({
      ...s,
      presetId: 'classic-white',
      bgType: 'solid',
      bgColor: '#ffffff',
      borderColor: '#cbd5e1',
      borderRadius: 0,
      borderWidth: 0,
      tearLineColor: '#94a3b8',
      tearLineStyle: 'none',
      bgOverlayDarkness: 0,
      bgOverlayBlur: 0,
      qrFgColor: '#000000',
      qrBgColor: '#ffffff',
      elements: {
        ...s.elements,
        brandLogo: { ...s.elements.brandLogo, color: '#0f172a' },
        eventTitle: { ...s.elements.eventTitle, color: '#0f172a' },
        zoneBadge: { ...s.elements.zoneBadge, color: '#0f172a' },
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
    desc: 'กระดาษการ์ดดำด้านลึก ตัวหนังสือสีขาวนวล สไตล์คอนเสิร์ตระดับโลก',
    apply: (s) => ({
      ...s,
      presetId: 'matte-black',
      bgType: 'solid',
      bgColor: '#111827',
      borderColor: '#374151',
      borderRadius: 0,
      borderWidth: 0,
      tearLineColor: '#4b5563',
      tearLineStyle: 'none',
      bgOverlayDarkness: 0,
      bgOverlayBlur: 0,
      qrFgColor: '#000000',
      qrBgColor: '#ffffff',
      elements: {
        ...s.elements,
        brandLogo: { ...s.elements.brandLogo, color: '#f8fafc' },
        eventTitle: { ...s.elements.eventTitle, color: '#ffffff' },
        zoneBadge: { ...s.elements.zoneBadge, color: '#f3f4f6' },
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
    desc: 'บัตรออบซิเดียนหรูหรา ตัวหนังสือทองประกายฟอยล์ สมฐานะบัตร VIP',
    apply: (s) => ({
      ...s,
      presetId: 'vip-gold-pass',
      bgType: 'solid',
      bgColor: '#18181b',
      borderColor: '#d97706',
      borderRadius: 0,
      borderWidth: 0,
      tearLineColor: '#b45309',
      tearLineStyle: 'none',
      bgOverlayDarkness: 0,
      bgOverlayBlur: 0,
      qrFgColor: '#000000',
      qrBgColor: '#fef08a',
      elements: {
        ...s.elements,
        brandLogo: { ...s.elements.brandLogo, color: '#fbbf24' },
        eventTitle: { ...s.elements.eventTitle, color: '#fbbf24' },
        zoneBadge: { ...s.elements.zoneBadge, color: '#fbbf24' },
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
      borderRadius: 0,
      borderWidth: 0,
      tearLineColor: '#c6ac8f',
      tearLineStyle: 'none',
      bgOverlayDarkness: 0,
      bgOverlayBlur: 0,
      qrFgColor: '#2d1500',
      qrBgColor: '#ffffff',
      elements: {
        ...s.elements,
        brandLogo: { ...s.elements.brandLogo, color: '#2d1500' },
        eventTitle: { ...s.elements.eventTitle, color: '#2d1500' },
        zoneBadge: { ...s.elements.zoneBadge, color: '#38281f' },
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
      borderRadius: 0,
      borderWidth: 0,
      tearLineColor: '#94a3b8',
      tearLineStyle: 'none',
      bgOverlayDarkness: 0,
      bgOverlayBlur: 0,
      qrFgColor: '#0f172a',
      qrBgColor: '#ffffff',
      elements: {
        ...s.elements,
        brandLogo: { ...s.elements.brandLogo, color: '#0f172a' },
        eventTitle: { ...s.elements.eventTitle, color: '#0f172a' },
        zoneBadge: { ...s.elements.zoneBadge, color: '#1e293b' },
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

function SecurityBarcodeSvg({
  code,
  color = '#0f172a',
  secondaryColor = '#64748b',
  secondaryText = 'SECURITY VERIFICATION',
  showSecondaryText = true,
  secondaryFontSize = 10,
  secondaryFontWeight = '400',
  fontSize = 10,
  fontWeight = '400',
  align = 'left',
}: {
  code: string;
  color?: string;
  secondaryColor?: string;
  secondaryText?: string;
  showSecondaryText?: boolean;
  secondaryFontSize?: number;
  secondaryFontWeight?: string;
  fontSize?: number;
  fontWeight?: string;
  align?: 'left' | 'center' | 'right';
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
    <div
      className="security-barcode-container"
      style={{
        alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        textAlign: align,
      }}
    >
      {showSecondaryText && secondaryText && (
        <div
          className="security-barcode-label"
          style={{
            color: secondaryColor,
            fontSize: `${secondaryFontSize}px`,
            fontWeight: secondaryFontWeight,
          }}
        >
          {secondaryText}
        </div>
      )}
      <svg width="180" height="34" viewBox="0 0 180 34" fill="none" xmlns="http://www.w3.org/2000/svg">
        <title>Security Barcode</title>
        {bars.map((bar) => {
          const x = currentX;
          currentX += bar.width * 2;
          if (!bar.isBlack || currentX > 175) return null;
          return <rect key={bar.id} x={x} y={0} width={bar.width * 1.8} height={34} fill={color} />;
        })}
      </svg>
      <div
        className="security-barcode-code"
        style={{
          color,
          fontSize: `${fontSize}px`,
          fontWeight,
        }}
      >
        *{code}*
      </div>
    </div>
  );
}

const IMAGE_COMPRESSION_LIMIT_BYTES = Math.floor(0.99 * 1024 * 1024);

async function compressImageUnderLimit(
  file: File,
  maxBytes = IMAGE_COMPRESSION_LIMIT_BYTES,
): Promise<{ file: File; wasCompressed: boolean; originalBytes: number }> {
  if (file.size <= maxBytes) {
    return { file, wasCompressed: false, originalBytes: file.size };
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('ไม่สามารถอ่านข้อมูลภาพได้'));
      image.src = objectUrl;
    });

    const baseWidth = Math.min(img.naturalWidth || 1600, 1800);
    const baseHeight = img.naturalWidth > 0
      ? Math.round((img.naturalHeight / img.naturalWidth) * baseWidth)
      : 1000;
    const scales = [1, 0.85, 0.7, 0.55, 0.4, 0.3];
    const qualities = [0.88, 0.78, 0.68, 0.58, 0.46, 0.36];
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'ticket-bg';

    for (const scale of scales) {
      const targetW = Math.max(200, Math.round(baseWidth * scale));
      const targetH = Math.max(120, Math.round(baseHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) break;
      ctx.drawImage(img, 0, 0, targetW, targetH);

      for (const quality of qualities) {
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
        });
        if (blob && blob.size <= maxBytes) {
          return {
            file: new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }),
            wasCompressed: true,
            originalBytes: file.size,
          };
        }
      }
    }
    throw new Error('ไม่สามารถลดขนาดรูปภาพให้ไม่เกิน 0.99MB ได้ กรุณาเลือกไฟล์ขนาดเล็กลง');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function AdminTicketDesigner() {
  const [state, setState] = useState<TicketDesignerState>(DEFAULT_STATE);
  const [workspaceStage, setWorkspaceStage] = useState<WorkspaceStageSettings>(DEFAULT_WORKSPACE_STAGE);
  const [selectedId, setSelectedId] = useState<string | null>('eventTitle');
  const [activeSideTab, setActiveSideTab] = useState<DesignerTabId>('elements');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'studio' | 'mobile' | 'print'>('studio');
  void setViewMode;
  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>('fit');
  const [manualScale, setManualScale] = useState<number>(100);
  const [fitScale, setFitScale] = useState<number>(85);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isUploadingFont, setIsUploadingFont] = useState<boolean>(false);
  const [isDragOverDropzone, setIsDragOverDropzone] = useState<boolean>(false);

  const fontInputRef = useRef<HTMLInputElement | null>(null);

  // Countdown Toast Notification State
  const [countdownToast, setCountdownToast] = useState<{
    id: string;
    type: 'success' | 'info' | 'error';
    title: string;
    message?: string;
    durationMs: number;
  } | null>(null);

  const showStudioToast = useCallback(
    (params: {
      type: 'success' | 'info' | 'error';
      title: string;
      message?: string;
      durationMs?: number;
    }) => {
      const durationMs = params.durationMs || 4000;
      const id = `toast-${Date.now()}`;
      setCountdownToast({
        id,
        type: params.type,
        title: params.title,
        message: params.message,
        durationMs,
      });
    },
    [],
  );

  useEffect(() => {
    if (!countdownToast) return;
    const t = setTimeout(() => {
      setCountdownToast(null);
    }, countdownToast.durationMs);
    return () => clearTimeout(t);
  }, [countdownToast]);

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
    const mergeTemplate = (parsed: Partial<TicketDesignerState>): Partial<TicketDesignerState> => ({
      ...parsed,
      borderRadius: 0,
      borderWidth: 0,
      tearLineStyle: 'none',
    });

    try {
      const saved = localStorage.getItem(MASTER_TEMPLATE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && parsed.elements) {
          setState((prev) => ({
            ...prev,
            ...mergeTemplate(parsed),
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
          ...mergeTemplate(data.template),
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

  // Load Custom Uploaded Font Face dynamically so live preview & canvas export use it immediately
  useEffect(() => {
    if (!state.customFontUrl || !state.customFontName) return;
    if (typeof window === 'undefined' || typeof FontFace === 'undefined') return;
    let active = true;
    const safeFamily = state.customFontName;
    const url = state.customFontUrl;
    const face = new FontFace(safeFamily, `url("${url}")`);
    face
      .load()
      .then((loaded) => {
        if (!active) return;
        document.fonts.add(loaded);
      })
      .catch(() => {
        // Ignore font load failures on detached test DOM
      });
    return () => {
      active = false;
    };
  }, [state.customFontName, state.customFontUrl]);

  const effectiveScale = zoomMode === 'fit' ? fitScale : manualScale;

  // Form IDs helper
  const baseId = useId();
  const getFieldId = useCallback((name: string) => `${baseId}-${name}`, [baseId]);

  // Selected Item helper
  const selectedItem = useMemo(() => {
    if (!selectedId) return null;
    return state.elements[selectedId] || null;
  }, [selectedId, state.elements]);

  // Normalized bottom-to-top layer order (index 0 = bottom, last index = front-most)
  const orderedLayerIds = useMemo(() => {
    const existingKeys = Object.keys(state.elements);
    const seen = new Set<string>();
    const result: string[] = [];
    const savedOrder = Array.isArray(state.layerOrder) && state.layerOrder.length > 0
      ? state.layerOrder
      : DEFAULT_LAYER_ORDER;

    for (const id of savedOrder) {
      if (id in state.elements && !seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }
    for (const id of existingKeys) {
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }
    return result;
  }, [state.elements, state.layerOrder]);

  const handleMoveLayer = useCallback(
    (id: string, direction: 'up' | 'down') => {
      setState((prev) => {
        const keys = Object.keys(prev.elements);
        const seen = new Set<string>();
        const list: string[] = [];
        const currentOrder = Array.isArray(prev.layerOrder) && prev.layerOrder.length > 0
          ? prev.layerOrder
          : DEFAULT_LAYER_ORDER;
        for (const k of currentOrder) {
          if (k in prev.elements && !seen.has(k)) {
            seen.add(k);
            list.push(k);
          }
        }
        for (const k of keys) {
          if (!seen.has(k)) {
            seen.add(k);
            list.push(k);
          }
        }
        const idx = list.indexOf(id);
        if (idx === -1) return prev;
        // 'up' means higher zIndex (towards end of bottom-to-top array)
        const targetIdx = direction === 'up' ? idx + 1 : idx - 1;
        if (targetIdx < 0 || targetIdx >= list.length) return prev;
        const next = [...list];
        const tmp = next[idx];
        next[idx] = next[targetIdx];
        next[targetIdx] = tmp;
        return { ...prev, layerOrder: next };
      });
    },
    [],
  );

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

  // Dynamic Workspace Stage Background Style (Fixed: Grid, Clean White, Deep Black)
  const stageBackgroundStyle = useMemo(() => {
    switch (workspaceStage.style) {
      case 'white':
        return {
          backgroundColor: '#ffffff',
          backgroundImage: 'none',
        };
      case 'dark-neutral':
        return {
          backgroundColor: '#18181b',
          backgroundImage: 'radial-gradient(#3f3f46 1.2px, transparent 1.2px)',
          backgroundSize: '20px 20px',
          backgroundAttachment: 'local',
        };
      default:
        return {
          backgroundColor: '#f8fafc',
          backgroundImage:
            'linear-gradient(to right, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          backgroundAttachment: 'local',
        };
    }
  }, [workspaceStage.style]);

  // Dynamic Notch Color matching stage background
  const notchColor = useMemo(() => {
    if (workspaceStage.style === 'white') return '#ffffff';
    if (workspaceStage.style === 'dark-neutral') return '#18181b';
    return '#f8fafc';
  }, [workspaceStage.style]);

  // Background CSS for Ticket Card (Solid, Gradient, or Uploaded Image only)
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
        return state.bgImageUrl
          ? {
              backgroundImage: `url(${state.bgImageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }
          : { backgroundColor: state.bgColor };
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

  const uploadTicketBackgroundFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('visibility', 'public');

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data?.url !== 'string' || !data.url) {
      throw new Error(
        typeof data?.message === 'string' && data.message
          ? data.message
          : 'อัปโหลดรูปภาพพื้นหลังไม่สำเร็จ'
      );
    }
    return data.url;
  };

  const dataUrlToImageFile = (dataUrl: string): File => {
    const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(dataUrl);
    if (!match) {
      throw new Error('รองรับเฉพาะไฟล์ภาพ PNG, JPEG หรือ WEBP เท่านั้น');
    }
    const rawMime = match[1].toLowerCase();
    const mime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
    const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], `ticket-background.${ext}`, { type: mime });
  };

  // Save Master Template
  const handleSaveMasterTemplate = async () => {
    try {
      let templateToSave: TicketDesignerState = {
        ...state,
        borderRadius: 0,
        borderWidth: 0,
        tearLineStyle: 'none',
      };

      // Auto-migrate legacy Base64 data URLs to uploaded media URLs so DB persistence succeeds
      if (
        templateToSave.bgType === 'image' &&
        typeof templateToSave.bgImageUrl === 'string' &&
        templateToSave.bgImageUrl.startsWith('data:image/')
      ) {
        const rawFile = dataUrlToImageFile(templateToSave.bgImageUrl);
        const { file } = await compressImageUnderLimit(rawFile);
        const uploadedUrl = await uploadTicketBackgroundFile(file);
        templateToSave = {
          ...templateToSave,
          bgImageUrl: uploadedUrl,
        };
        setState(templateToSave);
      }

      // Synchronize with database first so errors are never masked as saved
      const res = await fetch('/api/owner/ticket-master-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: templateToSave }),
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg =
          typeof resData?.message === 'string' && resData.message
            ? resData.message
            : `รหัสข้อผิดพลาด ${res.status}`;
        showStudioToast({
          type: 'error',
          title: 'บันทึกแบบบัตรหลักลงฐานข้อมูลไม่สำเร็จ',
          message: errMsg,
          durationMs: 5000,
        });
        return;
      }

      localStorage.setItem(MASTER_TEMPLATE_STORAGE_KEY, JSON.stringify(templateToSave));
      window.dispatchEvent(
        new CustomEvent('ticket_master_template_updated', { detail: templateToSave })
      );
      window.dispatchEvent(
        new CustomEvent('ticket:master-template-changed', { detail: templateToSave })
      );

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const ch = new BroadcastChannel('ticket_master_template_channel');
          ch.postMessage({ type: 'UPDATE', template: templateToSave });
          ch.close();
        } catch {
          // ignore channel error
        }
      }

      showStudioToast({
        type: 'success',
        title: 'บันทึกแบบบัตรหลักสำเร็จ',
        message: 'แบบบัตรนี้ถูกนำไปใช้เป็นมาตรฐานกับบัตรทุกคอนเสิร์ตทั่วทั้งระบบแล้ว',
      });
    } catch (error) {
      const errMsg = error instanceof Error && error.message
        ? error.message
        : 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
      showStudioToast({
        type: 'error',
        title: 'บันทึกแบบบัตรหลักไม่สำเร็จ',
        message: errMsg,
      });
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
            borderRadius: 0,
            borderWidth: 0,
            tearLineStyle: 'none',
            elements: {
              ...DEFAULT_STATE.elements,
              ...(parsed.elements || {}),
            },
          });
          showStudioToast({
            type: 'info',
            title: 'โหลดแบบบัตรหลักสำเร็จ',
            message: 'นำรูปแบบบัตรหลักที่บันทึกไว้มาใช้งานบนโต๊ะเขียนแบบเรียบร้อยแล้ว',
          });
        }
      } else {
        showStudioToast({
          type: 'info',
          title: 'ใช้ค่าเริ่มต้นมาตรฐาน',
          message: 'ยังไม่มีการบันทึกแบบบัตรหลัก ระบบจะใช้ค่าเริ่มต้นมาตรฐาน',
        });
      }
    } catch {
      // ignore
    }
  };

  // Reset to default
  const handleResetPositions = () => {
    setState(DEFAULT_STATE);
    setSelectedId('eventTitle');
    showStudioToast({
      type: 'info',
      title: 'รีเซ็ตเริ่มต้นสำเร็จ',
      message: 'คืนค่าพิกัดและการจัดวางทุกชิ้นส่วนเป็นค่าเริ่มต้นมาตรฐาน',
    });
  };

  // Center element horizontally on card
  const handleCenterOnCard = (item: MovableItem) => {
    const hasTear = state.tearLineStyle && state.tearLineStyle !== 'none';
    const isStub = hasTear && (item.section === 'stub' || item.x >= state.tearLineX);
    let newX = 36;
    if (isStub) {
      const stubWidth = 1000 - state.tearLineX;
      const approxWidth = item.id === 'qrCode' ? (item.size || state.qrSize || 155) : Math.min(220, (item.text?.length || 10) * ((item.fontSize || 14) * 0.55));
      newX = Math.round(state.tearLineX + (stubWidth - approxWidth) / 2);
    } else if (hasTear) {
      const mainWidth = state.tearLineX;
      const approxWidth = Math.min(mainWidth - 60, (item.text?.length || 15) * ((item.fontSize || 16) * 0.55));
      newX = Math.max(20, Math.round((mainWidth - approxWidth) / 2));
    } else {
      const approxWidth = item.id === 'qrCode' ? (item.size || state.qrSize || 155) : Math.min(600, (item.text?.length || 15) * ((item.fontSize || 16) * 0.55));
      newX = Math.max(20, Math.round((1000 - approxWidth) / 2));
    }
    setState((prev) => ({
      ...prev,
      elements: {
        ...prev.elements,
        [item.id]: {
          ...prev.elements[item.id],
          x: newX,
          align: 'center',
        },
      },
    }));
  };

  // File Upload for Ticket Background (Auto-compress <= 0.99MB before uploading to /api/upload)
  const applyUploadedBackgroundFile = async (rawFile: File) => {
    showStudioToast({
      type: 'info',
      title: 'กำลังเตรียมรูปภาพ',
      message: 'กำลังตรวจสอบและอัปโหลดรูปภาพพื้นหลังบัตร...',
      durationMs: 3000,
    });
    try {
      const { file, wasCompressed, originalBytes } = await compressImageUnderLimit(rawFile);
      const uploadedUrl = await uploadTicketBackgroundFile(file);
      setState((prev) => ({
        ...prev,
        bgType: 'image',
        bgImageUrl: uploadedUrl,
      }));
      const finalKb = Math.max(1, Math.round(file.size / 1024));
      const origMb = (originalBytes / (1024 * 1024)).toFixed(2);
      showStudioToast({
        type: 'success',
        title: 'อัปโหลดรูปภาพพื้นหลังสำเร็จ',
        message: wasCompressed
          ? `ลดขนาดไฟล์อัตโนมัติจาก ${origMb}MB เหลือ ${finalKb}KB (ไม่เกิน 0.99MB) กด "บันทึกแบบบัตรหลัก" เพื่อใช้งานจริง`
          : `ขนาดไฟล์ ${finalKb}KB กด "บันทึกแบบบัตรหลัก" เพื่อใช้งานจริง`,
      });
    } catch (error) {
      const errMsg = error instanceof Error && error.message
        ? error.message
        : 'อัปโหลดรูปภาพพื้นหลังไม่สำเร็จ';
      showStudioToast({
        type: 'error',
        title: 'อัปโหลดไม่สำเร็จ',
        message: errMsg,
      });
    }
  };

  const handleTicketImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await applyUploadedBackgroundFile(file);
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

  const handleDropzoneDrop = async (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragOverDropzone(false);
    const file = e.dataTransfer.files?.[0];
    if (!file?.type.startsWith('image/')) return;
    await applyUploadedBackgroundFile(file);
  };

  const handleClearCardImage = () => {
    setState((prev) => ({
      ...prev,
      bgType: 'solid',
      bgColor: '#ffffff',
      bgImageUrl: '',
    }));
  };

  // Custom Font Upload Handler (.ttf, .otf, .woff, .woff2)
  const handleCustomFontUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsUploadingFont(true);
    showStudioToast({
      type: 'info',
      title: 'กำลังอัปโหลดฟอนต์',
      message: 'กำลังตรวจสอบและติดตั้งฟอนต์ใหม่...',
      durationMs: 3000,
    });
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/owner/ticket-font-upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data?.url !== 'string' || typeof data?.fontName !== 'string') {
        throw new Error(
          typeof data?.message === 'string' && data.message
            ? data.message
            : 'อัปโหลดฟอนต์ไม่สำเร็จ'
        );
      }

      if (typeof FontFace !== 'undefined') {
        const face = new FontFace(data.fontName, `url("${data.url}")`);
        const loaded = await face.load();
        document.fonts.add(loaded);
      }

      setState((prev) => ({
        ...prev,
        customFontUrl: data.url,
        customFontName: data.fontName,
        fontFamily: data.fontName,
      }));
      showStudioToast({
        type: 'success',
        title: 'ติดตั้งฟอนต์ใหม่สำเร็จ',
        message: `เลือกใช้ฟอนต์ "${data.fontName}" กับบัตรคอนเสิร์ตเรียบร้อย`,
      });
    } catch (error) {
      const errMsg = error instanceof Error && error.message
        ? error.message
        : 'อัปโหลดฟอนต์ไม่สำเร็จ';
      showStudioToast({
        type: 'error',
        title: 'อัปโหลดฟอนต์ไม่สำเร็จ',
        message: errMsg,
      });
    } finally {
      setIsUploadingFont(false);
    }
  };

  const handleClearCustomFont = () => {
    setState((prev) => ({
      ...prev,
      customFontUrl: '',
      customFontName: '',
      fontFamily: 'Kanit',
    }));
    showStudioToast({
      type: 'info',
      title: 'คืนค่าฟอนต์มาตรฐาน',
      message: 'เปลี่ยนกลับไปใช้ฟอนต์ Kanit เรียบร้อยแล้ว',
    });
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

  // High-Res PNG Export (1200 x 500 px canvas, Square Edges Only, Ordered Layers, Zero Boxes)
  const handleExportPng = useCallback(async () => {
    setIsExporting(true);
    try {
      const width = 1200;
      const height = 500;
      const scaleFactor = 1200 / 1000;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');

      // 1. Card Background (Square corners only)
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
          ctx.fillStyle = state.bgColor || '#0f172a';
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

      // 3. Draw Movable Elements in exact Layer Order (bottom-to-top, Zero Boxes/Borders)
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const fontStack = state.fontFamily && state.fontFamily !== 'Kanit'
        ? `"${state.fontFamily}", Kanit, sans-serif`
        : 'Kanit, sans-serif';
      const defaultTitleWeight = String(state.titleFontWeight ?? 400);
      const defaultBodyWeight = String(state.bodyFontWeight ?? 400);

      for (const id of orderedLayerIds) {
        const el = state.elements[id];
        if (!el?.visible) continue;

        const titleWeight = el.secondaryFontWeight || defaultTitleWeight;
        const bodyWeight = el.fontWeight || defaultBodyWeight;
        const secSizePx = el.secondaryFontSize || (
          id === 'brandLogo' || id === 'barcode' || id === 'footerNote' || id === 'scanHint' || id === 'stubEventSummary' || id === 'qrCodeLabel' || id === 'orderId'
            ? 10
            : 11
        );
        const bodySizePx = el.fontSize || (id === 'eventTitle' ? 26 : id === 'brandLogo' || id === 'gateInfo' || id === 'seatInfo' || id === 'priceInfo' || id === 'zoneBadge' ? 16 : 14);
        const showSec = el.showSecondaryText !== false && Boolean(el.secondaryText);
        const posX = el.x * scaleFactor;
        const posY = el.y * scaleFactor;

        if (id === 'brandLogo') {
          ctx.fillStyle = el.color || '#0f172a';
          ctx.font = `${bodyWeight} ${Math.round(bodySizePx * scaleFactor)}px ${fontStack}`;
          ctx.fillText(el.text || 'TICKET', posX + 24, posY);
          if (showSec && el.secondaryText) {
            ctx.fillStyle = el.secondaryColor || '#64748b';
            ctx.font = `${titleWeight} ${Math.round(secSizePx * scaleFactor)}px ${fontStack}`;
            ctx.fillText(el.secondaryText, posX + 92, posY + 4);
          }
          continue;
        }

        if (id === 'barcode') {
          if (!el.text) continue;
          let yCursor = posY;
          if (showSec && el.secondaryText) {
            ctx.fillStyle = el.secondaryColor || '#64748b';
            ctx.font = `${titleWeight} ${Math.round(secSizePx * scaleFactor)}px ${fontStack}`;
            ctx.fillText(el.secondaryText, posX, yCursor);
            yCursor += Math.round((secSizePx + 4) * scaleFactor);
          }
          ctx.fillStyle = el.color || '#0f172a';
          let barOffset = 0;
          for (let i = 0; i < 35; i++) {
            const w = (i % 3 === 0 ? 3 : 1.5) * scaleFactor;
            ctx.fillRect(posX + barOffset, yCursor, w, 24 * scaleFactor);
            barOffset += w + 2 * scaleFactor;
          }
          const totalBarsWidth = Math.max(barOffset - 2 * scaleFactor, 100);
          const codeString = `*${el.text}*`;
          ctx.font = `${bodyWeight} ${Math.round(bodySizePx * scaleFactor)}px ${fontStack}`;
          const codeW = ctx.measureText(codeString).width;
          ctx.fillText(codeString, posX + Math.max(0, (totalBarsWidth - codeW) / 2), yCursor + 26 * scaleFactor);
          continue;
        }

        if (id === 'qrCode') {
          const qrImg = new Image();
          await new Promise<void>((resolve) => {
            qrImg.onload = () => resolve();
            qrImg.onerror = () => resolve();
            qrImg.src = qrSvgDataUrl;
          });
          const qrW = (el.size || state.qrSize || 155) * scaleFactor;
          ctx.drawImage(qrImg, posX, posY, qrW, qrW);
          continue;
        }

        // Standard Text Elements (Header as fixed anchor, detail value aligned relative to header)
        const secFont = `${titleWeight} ${Math.round(secSizePx * scaleFactor)}px ${fontStack}`;
        const bodyFont = `${bodyWeight} ${Math.round(bodySizePx * scaleFactor)}px ${fontStack}`;
        const align = el.align || 'left';
        const isCenter = align === 'center';
        const isRight = align === 'right';

        let headerWidth = 0;
        let currentY = posY;

        if (showSec && el.secondaryText) {
          ctx.save();
          ctx.font = secFont;
          headerWidth = ctx.measureText(el.secondaryText).width;
          ctx.fillStyle = el.secondaryColor || '#64748b';
          ctx.textAlign = 'left';
          ctx.fillText(el.secondaryText, posX, currentY);
          ctx.restore();
          currentY += Math.round((secSizePx + 4) * scaleFactor);
        }

        if (el.text) {
          ctx.save();
          ctx.fillStyle = el.color || '#0f172a';
          ctx.font = bodyFont;
          if (showSec && headerWidth > 0) {
            const anchorX = isCenter ? posX + headerWidth / 2 : isRight ? posX + headerWidth : posX;
            ctx.textAlign = isCenter ? 'center' : isRight ? 'right' : 'left';
            ctx.fillText(el.text, anchorX, currentY);
          } else {
            ctx.textAlign = isCenter ? 'center' : isRight ? 'right' : 'left';
            ctx.fillText(el.text, posX, currentY);
          }
          ctx.restore();
        }
      }

      // Trigger Download
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `ticket-design-${state.presetId}-${Date.now()}.png`;
      a.click();
      showStudioToast({
        type: 'success',
        title: 'ส่งออกไฟล์ PNG สำเร็จ',
        message: 'ดาวน์โหลดภาพบัตรคอนเสิร์ตความละเอียดสูงเรียบร้อยแล้ว',
      });
    } finally {
      setIsExporting(false);
    }
  }, [state, orderedLayerIds, qrSvgDataUrl, showStudioToast]);

  // Alignment-only helper (Zero boxes, zero borders per D-289)
  const getElementBoxStyle = (el: MovableItem | undefined): CSSProperties => {
    const align = el?.align || 'left';
    return {
      textAlign: align,
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
    };
  };

  // Render a Single Movable Element by layer order (zero boxes/borders per D-289)
  const renderMovableElement = (id: string, layerIndex: number, isInteractive: boolean) => {
    const el = state.elements[id];
    if (!el?.visible) return null;

    const titleWeight = el.secondaryFontWeight || String(state.titleFontWeight ?? 400);
    const bodyWeight = el.fontWeight || String(state.bodyFontWeight ?? 400);
    const secSize =
      el.secondaryFontSize ||
      (id === 'brandLogo' || id === 'barcode' || id === 'footerNote' || id === 'scanHint' || id === 'stubEventSummary' || id === 'qrCodeLabel' || id === 'orderId'
        ? 10
        : 11);
    const showSec = el.showSecondaryText !== false && Boolean(el.secondaryText);
    const align = el.align || 'left';
    const isSelected = isInteractive && selectedId === id;

    if (id === 'qrCode') {
      return (
        <div
          key={id}
          className={`movable-item qr-movable-box ${isSelected ? 'is-selected' : ''}`}
          style={{
            transform: `translate(${el.x}px, ${el.y}px)`,
            zIndex: 10 + layerIndex,
          }}
          onPointerDown={(e) => handlePointerDown('qrCode', e)}
        >
          <button
            type="button"
            className="surface-qr-btn"
            style={{
              backgroundColor: 'transparent',
              width: `${state.qrSize}px`,
              height: `${state.qrSize}px`,
              borderRadius: 0,
              padding: 0,
              border: 'none',
              overflow: 'hidden',
            }}
            onClick={(e) => {
              e.stopPropagation();
              showStudioToast({
                type: 'success',
                title: 'ผลการทดสอบสแกน QR Code',
                message: `รหัสผ่านประตู: ${state.qrPayload}`,
              });
            }}
            title="คลิกเพื่อทดสอบผลการสแกน QR"
          >
            {/* biome-ignore lint/performance/noImgElement: direct rendered SVG QR */}
            <img
              src={qrSvgDataUrl}
              alt="Ticket QR Code"
              style={{ width: '100%', height: '100%', display: 'block', borderRadius: 0 }}
            />
          </button>
          {isSelected && (
            <span className="coord-chip">X: {el.x} Y: {el.y}</span>
          )}
        </div>
      );
    }

    if (id === 'barcode') {
      return (
        <div
          key={id}
          className={`movable-item ${isSelected ? 'is-selected' : ''}`}
          style={{
            transform: `translate(${el.x}px, ${el.y}px)`,
            zIndex: 10 + layerIndex,
          }}
          onPointerDown={(e) => handlePointerDown('barcode', e)}
        >
          <SecurityBarcodeSvg
            code={el.text || 'TK-849201-9482-01'}
            color={el.color}
            secondaryColor={el.secondaryColor}
            secondaryText={el.secondaryText}
            showSecondaryText={showSec}
            secondaryFontSize={secSize}
            secondaryFontWeight={titleWeight}
            fontSize={el.fontSize || 10}
            fontWeight={bodyWeight}
            align={align}
          />
          {isSelected && (
            <span className="coord-chip">X: {el.x} Y: {el.y}</span>
          )}
        </div>
      );
    }

    if (id === 'brandLogo') {
      return (
        <div
          key={id}
          className={`movable-item ${isSelected ? 'is-selected' : ''}`}
          style={{
            transform: `translate(${el.x}px, ${el.y}px)`,
            zIndex: 10 + layerIndex,
          }}
          onPointerDown={(e) => handlePointerDown('brandLogo', e)}
        >
          <div className="brand-logo-content" style={{ color: el.color, ...getElementBoxStyle(el) }}>
            <TicketIcon style={{ width: 18, height: 18 }} />
            <strong style={{ fontSize: `${el.fontSize || 16}px`, fontWeight: bodyWeight }}>
              {el.text || 'TICKET'}
            </strong>
            {showSec && (
              <span
                className="brand-official-tag"
                style={{
                  color: el.secondaryColor || '#64748b',
                  fontSize: `${secSize}px`,
                  fontWeight: titleWeight,
                }}
              >
                {el.secondaryText}
              </span>
            )}
          </div>
          {isSelected && (
            <span className="coord-chip">X: {el.x} Y: {el.y}</span>
          )}
        </div>
      );
    }

    const defaultBodySize =
      id === 'eventTitle'
        ? 26
        : id === 'zoneBadge' || id === 'gateInfo' || id === 'seatInfo' || id === 'priceInfo'
          ? 16
          : id === 'dateTime' || id === 'venue' || id === 'ticketCode'
            ? 14
            : id === 'buyerName' || id === 'qrCodeLabel'
              ? 13
              : id === 'stubEventSummary'
                ? 12
                : 11;
    const isMono = id === 'ticketCode' || id === 'qrCodeLabel' || id === 'orderId';
    const wrapperClass =
      id === 'stubEventSummary'
        ? 'stub-event-summary-block'
        : id === 'qrCodeLabel' || id === 'orderId'
          ? 'stub-code-block'
          : 'meta-block';

    const isCenter = align === 'center';
    const isRight = align === 'right';

    return (
      <div
        key={id}
        className={`movable-item ${isSelected ? 'is-selected' : ''}`}
        style={{
          transform: `translate(${el.x}px, ${el.y}px)`,
          zIndex: 10 + layerIndex,
        }}
        onPointerDown={(e) => handlePointerDown(id, e)}
      >
        <div
          className={wrapperClass}
          style={{
            position: 'relative',
            display: 'inline-block',
            textAlign: 'left',
          }}
        >
          {showSec && (
            <span
              className="meta-label"
              style={{
                color: el.secondaryColor || '#64748b',
                fontSize: `${secSize}px`,
                fontWeight: titleWeight,
                whiteSpace: 'nowrap',
                display: 'block',
                textAlign: 'left',
                lineHeight: 1.2,
                marginBottom: 2,
              }}
            >
              {el.secondaryText}
            </span>
          )}
          <span
            className={`${id === 'eventTitle' ? 'element-title-text' : id === 'footerNote' ? 'footer-disclaimer' : 'meta-val'}${isMono ? ' font-mono' : ''}`}
            style={{
              margin: 0,
              color: el.color || '#0f172a',
              fontSize: `${el.fontSize || defaultBodySize}px`,
              fontWeight: bodyWeight,
              lineHeight: id === 'eventTitle' ? 1.15 : 1.3,
              whiteSpace: id === 'eventTitle' ? 'normal' : 'nowrap',
              display: 'block',
              ...(showSec
                ? isCenter
                  ? { position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)' }
                  : isRight
                  ? { position: 'absolute', top: '100%', right: 0 }
                  : { position: 'relative', left: 0 }
                : { textAlign: align }
              ),
            }}
          >
            {el.text}
          </span>
        </div>
        {isSelected && (
          <span className="coord-chip">X: {el.x} Y: {el.y}</span>
        )}
      </div>
    );
  };

  // Render Canonical Ticket Surface (Square edges only, ordered layers per D-289)
  const renderTicketCard = (isInteractive: boolean) => {
    const resolvedFontFamily = state.fontFamily && state.fontFamily !== 'Kanit'
      ? `"${state.fontFamily}", Kanit, sans-serif`
      : 'Kanit, sans-serif';

    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: stage background deselect helper
      // biome-ignore lint/a11y/noStaticElementInteractions: stage background deselect helper
      <div
        className="ticket-surface-box"
        style={{
          width: '1000px',
          height: '420px',
          transform: isInteractive ? `scale(${effectiveScale / 100})` : 'none',
          transformOrigin: 'top left',
          borderRadius: '0px',
          border: 'none',
          fontFamily: resolvedFontFamily,
          ...backgroundStyle,
        }}
        onClick={(e) => {
          if (isInteractive && e.target === e.currentTarget) {
            setSelectedId(null);
          }
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

        {/* Ordered Movable Elements */}
        {orderedLayerIds.map((id, idx) => renderMovableElement(id, idx, isInteractive))}
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
          <h1 className="studio-title">ออกแบบบัตรคอนเสิร์ต (Ticket Designer)</h1>
        </div>

        {/* Top Actions */}
        <div className="studio-top-actions">
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

          {/* Single Toggle Button for Right Floating Drawer */}
          <button
            type="button"
            className="studio-btn secondary toggle-sidebar-btn"
            onClick={() => setIsSidebarOpen((v) => !v)}
            title={isSidebarOpen ? 'ปิดเมนูปรับแต่ง' : 'เปิดเมนูปรับแต่ง'}
            aria-label={isSidebarOpen ? 'ปิดเมนูปรับแต่ง' : 'เปิดเมนูปรับแต่ง'}
          >
            {isSidebarOpen ? <ChevronRightIcon style={{ width: 16, height: 16 }} /> : <ChevronLeftIcon style={{ width: 16, height: 16 }} />}
            <span>{isSidebarOpen ? 'ปิดเมนู' : 'เปิดเมนู'}</span>
          </button>
        </div>
      </header>

      {/* Countdown Toast Notification (Single unified toast system) */}
      {countdownToast && (
        <div className="studio-countdown-toast" role="status" aria-live="polite">
          <div className="studio-countdown-toast-content">
            <div className="studio-countdown-toast-icon">
              {countdownToast.type === 'success' && <CheckIcon style={{ width: 18, height: 18, color: '#16a34a' }} />}
              {countdownToast.type === 'info' && <SparklesIcon style={{ width: 18, height: 18, color: '#0284c7' }} />}
              {countdownToast.type === 'error' && <XIcon style={{ width: 18, height: 18, color: '#dc2626' }} />}
            </div>
            <div className="studio-countdown-toast-text">
              <h5 className="studio-countdown-toast-title">{countdownToast.title}</h5>
              {countdownToast.message && <p className="studio-countdown-toast-desc">{countdownToast.message}</p>}
            </div>
            <button
              type="button"
              className="studio-countdown-toast-close"
              onClick={() => setCountdownToast(null)}
              title="ปิดการแจ้งเตือน"
              aria-label="ปิดการแจ้งเตือน"
            >
              <XIcon style={{ width: 15, height: 15 }} />
            </button>
          </div>
          <div
            key={countdownToast.id}
            className="studio-countdown-toast-bar"
            style={{ animationDuration: `${countdownToast.durationMs}ms` }}
          />
        </div>
      )}

      {/* 2. Main Studio Viewport */}
      <div className="studio-main-viewport">
        {/* Central Drafting Canvas Stage with Dynamic Stage Style */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: stage background deselect helper */}
        <main
          ref={stageRef}
          className="studio-canvas-stage"
          style={stageBackgroundStyle}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          {viewMode === 'studio' && (
            <>
              {/* Zoom / Scale + Floating Stage Background Toolbar */}
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

                <div className="dock-divider" />

                {/* Floating Stage Background Switcher */}
                <div className="dock-stage-group">
                  <span className="dock-group-label">ฉากหลัง:</span>
                  <button
                    type="button"
                    className={`scale-pill-btn stage-dock-btn ${workspaceStage.style === 'grid' ? 'active' : ''}`}
                    onClick={() => setWorkspaceStage((prev) => ({ ...prev, style: 'grid' }))}
                    title="ฉากหลังโต๊ะทำงานแบบตาราง"
                  >
                    แบบตาราง
                  </button>
                  <button
                    type="button"
                    className={`scale-pill-btn stage-dock-btn ${workspaceStage.style === 'white' ? 'active' : ''}`}
                    onClick={() => setWorkspaceStage((prev) => ({ ...prev, style: 'white' }))}
                    title="ฉากหลังโต๊ะทำงานสีขาว"
                  >
                    สีขาว
                  </button>
                  <button
                    type="button"
                    className={`scale-pill-btn stage-dock-btn ${workspaceStage.style === 'dark-neutral' ? 'active' : ''}`}
                    onClick={() => setWorkspaceStage((prev) => ({ ...prev, style: 'dark-neutral' }))}
                    title="ฉากหลังโต๊ะทำงานสีดำ"
                  >
                    สีดำ
                  </button>
                </div>
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
        </main>

        {/* 3. Floating Right Overlay Drawer (Overlays canvas without shifting card) */}
        {isSidebarOpen && (
          <aside className="studio-side-panel floating-right-drawer">
            {/* Drawer Header with X Close Button */}
            <div className="side-panel-header">
              <div className="side-panel-header-title">
                <SlidersIcon style={{ width: 16, height: 16 }} />
                <span>เมนูปรับแต่งบัตร</span>
              </div>
              <button
                type="button"
                className="side-panel-collapse-btn"
                onClick={() => setIsSidebarOpen(false)}
                title="ปิดเมนูปรับแต่ง"
                aria-label="ปิดเมนูปรับแต่ง"
              >
                <XIcon style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* 4 Focused Navigation Tabs */}
            <nav className="side-nav-tabs" aria-label="แท็บเมนูเครื่องมือ">
              <button
                type="button"
                className={`side-tab-btn ${activeSideTab === 'elements' ? 'active' : ''}`}
                onClick={() => setActiveSideTab('elements')}
                title="ปรับแต่งชิ้นส่วน ข้อความ หัวข้อ ขนาด สี และพิกัด"
              >
                <SlidersIcon style={{ width: 14, height: 14 }} />
                <span>ชิ้นส่วน</span>
              </button>
              <button
                type="button"
                className={`side-tab-btn ${activeSideTab === 'layers' || activeSideTab === 'allElements' ? 'active' : ''}`}
                onClick={() => setActiveSideTab('layers')}
                title="จัดลำดับชั้นเลเยอร์ขึ้น-ลง และเปิด/ปิดการแสดงผล"
              >
                <EyeIcon style={{ width: 14, height: 14 }} />
                <span>เลเยอร์</span>
              </button>
              <button
                type="button"
                className={`side-tab-btn ${activeSideTab === 'card' || activeSideTab === 'cardBg' ? 'active' : ''}`}
                onClick={() => setActiveSideTab('card')}
                title="เฉดสีพื้นหลังบัตรและอัปโหลดรูปภาพ (ไม่เกิน 0.99MB)"
              >
                <SparklesIcon style={{ width: 14, height: 14 }} />
                <span>พื้นหลัง</span>
              </button>
              <button
                type="button"
                className={`side-tab-btn ${activeSideTab === 'font' ? 'active' : ''}`}
                onClick={() => setActiveSideTab('font')}
                title="เลือกฟอนต์เฉพาะบัตร ปรับหนา-บาง 100-900 และอัปโหลดฟอนต์ใหม่"
              >
                <RefreshIcon style={{ width: 14, height: 14 }} />
                <span>ฟอนต์</span>
              </button>
            </nav>

            {/* TAB 1: ELEMENTS & CONTEXTUAL INSPECTOR (No frames/boxes, no suggested color swatches) */}
            {activeSideTab === 'elements' && (
              <div className="side-tab-content">
                {selectedItem ? (
                  <div className="inspector-card">
                    <div className="inspector-card-header">
                      <div className="inspector-card-header-top">
                        <span className="inspector-item-badge">กำลังแก้ไข</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="studio-btn secondary view-layers-shortcut-btn"
                            style={{ height: '26px', padding: '0 0.5rem', fontSize: '0.72rem' }}
                            onClick={() => setActiveSideTab('layers')}
                            title="ไปที่แท็บจัดการเลเยอร์"
                          >
                            จัดเลเยอร์
                          </button>
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
                            <span>ซ่อน</span>
                          </button>
                        </div>
                      </div>
                      <h3 className="inspector-item-title">{selectedItem.label}</h3>
                    </div>

                    {/* NON-QR TEXT & BARCODE SUITE */}
                    {selectedItem.id !== 'qrCode' && (
                      <>
                        {/* Show / Hide Section Title Toggle (Every Part) */}
                        <div className="studio-field">
                          <div className="studio-toggle-row">
                            <label htmlFor={getFieldId('toggleSecondaryText')} className="studio-label" style={{ margin: 0 }}>
                              แสดงชื่อหัวข้อ (Show Title)
                            </label>
                            <input
                              id={getFieldId('toggleSecondaryText')}
                              type="checkbox"
                              checked={selectedItem.showSecondaryText !== false}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setState((prev) => ({
                                  ...prev,
                                  elements: {
                                    ...prev.elements,
                                    [selectedItem.id]: {
                                      ...prev.elements[selectedItem.id],
                                      showSecondaryText: checked,
                                      secondaryText: prev.elements[selectedItem.id].secondaryText || 'หัวข้อ (TITLE)',
                                    },
                                  },
                                }));
                              }}
                            />
                          </div>
                        </div>

                        {/* Secondary Title Controls (When shown) */}
                        {selectedItem.showSecondaryText !== false && (
                          <div style={{ padding: '0.6rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                            <div className="studio-field">
                              <label htmlFor={getFieldId('itemSecondaryText')} className="studio-label">
                                ข้อความหัวข้อ (Title Text)
                              </label>
                              <input
                                id={getFieldId('itemSecondaryText')}
                                type="text"
                                className="studio-input"
                                value={selectedItem.secondaryText ?? ''}
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

                            <div className="studio-field">
                              <label htmlFor={getFieldId('itemSecondaryColor')} className="studio-label">
                                สีข้อความหัวข้อ (Title Color)
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
                                  aria-label="รหัสสีข้อความหัวข้อ"
                                />
                              </div>
                            </div>

                            <div className="studio-field">
                              <label htmlFor={getFieldId('itemSecondaryFontSize')} className="studio-label">
                                ขนาดข้อความหัวข้อ ({selectedItem.secondaryFontSize ?? 11}px)
                              </label>
                              <input
                                id={getFieldId('itemSecondaryFontSize')}
                                type="range"
                                min={9}
                                max={28}
                                value={selectedItem.secondaryFontSize ?? 11}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setState((prev) => ({
                                    ...prev,
                                    elements: {
                                      ...prev.elements,
                                      [selectedItem.id]: {
                                        ...prev.elements[selectedItem.id],
                                        secondaryFontSize: val,
                                      },
                                    },
                                  }));
                                }}
                              />
                            </div>

                            <div className="studio-field">
                              <label htmlFor={getFieldId('itemSecondaryWeight')} className="studio-label">
                                น้ำหนักหัวข้อเฉพาะส่วน
                              </label>
                              <select
                                id={getFieldId('itemSecondaryWeight')}
                                className="studio-select"
                                value={selectedItem.secondaryFontWeight || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setState((prev) => ({
                                    ...prev,
                                    elements: {
                                      ...prev.elements,
                                      [selectedItem.id]: {
                                        ...prev.elements[selectedItem.id],
                                        secondaryFontWeight: val || undefined,
                                      },
                                    },
                                  }));
                                }}
                              >
                                <option value="">ค่าตามเมนูฟอนต์ ({state.titleFontWeight ?? 400})</option>
                                {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                                  <option key={w} value={String(w)}>{w}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}

                        {/* Detail Text Controls */}
                        <div className="studio-field" style={{ marginTop: '0.25rem' }}>
                          <label htmlFor={getFieldId('itemText')} className="studio-label">
                            ข้อความรายละเอียด (Detail Text)
                          </label>
                          <input
                            id={getFieldId('itemText')}
                            type="text"
                            className="studio-input"
                            value={selectedItem.text ?? ''}
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

                        <div className="studio-field">
                          <label htmlFor={getFieldId('itemColor')} className="studio-label">
                            สีข้อความรายละเอียด (Detail Color)
                          </label>
                          <div className="studio-color-row">
                            <input
                              id={getFieldId('itemColor')}
                              type="color"
                              value={selectedItem.color || '#0f172a'}
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
                              value={selectedItem.color || '#0f172a'}
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
                              aria-label="รหัสสีข้อความรายละเอียด"
                            />
                          </div>
                        </div>

                        <div className="studio-field">
                          <label htmlFor={getFieldId('itemFontSize')} className="studio-label">
                            ขนาดข้อความรายละเอียด ({selectedItem.fontSize ?? 14}px)
                          </label>
                          <input
                            id={getFieldId('itemFontSize')}
                            type="range"
                            min={10}
                            max={48}
                            value={selectedItem.fontSize ?? 14}
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

                        <div className="studio-field">
                          <label htmlFor={getFieldId('itemBodyWeight')} className="studio-label">
                            น้ำหนักรายละเอียดเฉพาะส่วน
                          </label>
                          <select
                            id={getFieldId('itemBodyWeight')}
                            className="studio-select"
                            value={selectedItem.fontWeight || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setState((prev) => ({
                                ...prev,
                                elements: {
                                  ...prev.elements,
                                  [selectedItem.id]: {
                                    ...prev.elements[selectedItem.id],
                                    fontWeight: val || undefined,
                                  },
                                },
                              }));
                            }}
                          >
                            <option value="">ค่าตามเมนูฟอนต์ ({state.bodyFontWeight ?? 400})</option>
                            {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                              <option key={w} value={String(w)}>{w}</option>
                            ))}
                          </select>
                        </div>

                        {/* Text Alignment Controls & Center on Card */}
                        <div className="studio-field">
                          <span className="studio-label">การจัดตำแหน่งข้อความ (Text Alignment)</span>
                          <div className="align-btn-group">
                            {(['left', 'center', 'right'] as const).map((al) => (
                              <button
                                key={al}
                                type="button"
                                className={`align-option-btn ${(!selectedItem.align && al === 'left') || selectedItem.align === al ? 'active' : ''}`}
                                onClick={() => {
                                  setState((prev) => ({
                                    ...prev,
                                    elements: {
                                      ...prev.elements,
                                      [selectedItem.id]: {
                                        ...prev.elements[selectedItem.id],
                                        align: al,
                                      },
                                    },
                                  }));
                                }}
                              >
                                {al === 'left' ? 'ชิดซ้าย' : al === 'center' ? 'กึ่งกลาง' : 'ชิดขวา'}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            className="studio-btn secondary center-on-card-btn"
                            onClick={() => handleCenterOnCard(selectedItem)}
                            title="คำนวณตำแหน่ง X เพื่อจัดกึ่งกลางพื้นที่บัตรอัตโนมัติ"
                          >
                            จัดกึ่งกลางพื้นที่บัตรอัตโนมัติ (Center on Card)
                          </button>
                        </div>
                      </>
                    )}

                    {/* QR CODE INSPECTOR (Zero boxes, zero borders, zero radius, pure fg/bg colors) */}
                    {selectedItem.id === 'qrCode' && (
                      <div className="qr-inspector-section" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', fontWeight: 400, color: '#0f172a' }}>
                          ปรับแต่งคิวอาร์โค้ด (QR Code)
                        </h4>

                        <div className="studio-field">
                          <label htmlFor={getFieldId('qrSizeVal')} className="studio-label">
                            ขนาดคิวอาร์โค้ด ({state.qrSize}px)
                          </label>
                          <input
                            id={getFieldId('qrSizeVal')}
                            type="range"
                            min={100}
                            max={240}
                            value={state.qrSize}
                            onChange={(e) => setState((prev) => ({ ...prev, qrSize: Number(e.target.value) }))}
                          />
                        </div>

                        <div className="studio-grid-2">
                          <div className="studio-field">
                            <label htmlFor={getFieldId('qrFgColor')} className="studio-label">สีจุด QR</label>
                            <div className="studio-color-row">
                              <input
                                id={getFieldId('qrFgColor')}
                                type="color"
                                value={state.qrFgColor}
                                onChange={(e) => setState((prev) => ({ ...prev, qrFgColor: e.target.value }))}
                              />
                              <input
                                type="text"
                                className="studio-input"
                                value={state.qrFgColor}
                                onChange={(e) => setState((prev) => ({ ...prev, qrFgColor: e.target.value }))}
                                aria-label="รหัสสีจุด QR"
                              />
                            </div>
                          </div>
                          <div className="studio-field">
                            <label htmlFor={getFieldId('qrBgColor')} className="studio-label">สีพื้นหลัง QR</label>
                            <div className="studio-color-row">
                              <input
                                id={getFieldId('qrBgColor')}
                                type="color"
                                value={state.qrBgColor}
                                onChange={(e) => setState((prev) => ({ ...prev, qrBgColor: e.target.value }))}
                              />
                              <input
                                type="text"
                                className="studio-input"
                                value={state.qrBgColor}
                                onChange={(e) => setState((prev) => ({ ...prev, qrBgColor: e.target.value }))}
                                aria-label="รหัสสีพื้นหลัง QR"
                              />
                            </div>
                          </div>
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
                      </div>
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

                    {selectedItem.id === 'qrCode' && (
                      <div style={{ marginTop: '0.4rem', marginBottom: '0.65rem' }}>
                        <button
                          type="button"
                          className="studio-btn secondary center-on-card-btn"
                          style={{ width: '100%', height: '32px', fontSize: '0.78rem' }}
                          onClick={() => handleCenterOnCard(selectedItem)}
                          title="คำนวณตำแหน่ง X เพื่อจัดกึ่งกลางพื้นที่บัตรอัตโนมัติ"
                        >
                          จัดกึ่งกลางพื้นที่บัตรอัตโนมัติ (Center on Card)
                        </button>
                      </div>
                    )}

                    {/* Quick Elements Switcher */}
                    <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid #e2e8f0' }}>
                      <span style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.45rem' }}>
                        เลือกชิ้นส่วนอื่นเพื่อแก้ไข:
                      </span>
                      <div className="section-card-items">
                        {orderedLayerIds.map((itemId) => {
                          const item = state.elements[itemId];
                          if (!item) return null;
                          return (
                            <button
                              key={itemId}
                              type="button"
                              className={`section-quick-item-btn ${selectedId === itemId ? 'active' : ''} ${!item.visible ? 'is-hidden' : ''}`}
                              onClick={() => setSelectedId(itemId)}
                            >
                              {item.label.split(' (')[0]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="inspector-empty-state">
                    <SlidersIcon style={{ width: 28, height: 28, color: '#64748b' }} />
                    <h4>โครงสร้างองค์ประกอบบัตรคอนเสิร์ต</h4>
                    <p>คลิกเลือกชิ้นส่วนบนบัตรเพื่อลากย้าย หรือเลือกจากหมวดหมู่ด้านล่าง:</p>
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

            {/* TAB 2: DEDICATED LAYERS TAB (Reorderable Up/Down + Visibility) */}
            {(activeSideTab === 'layers' || activeSideTab === 'allElements') && (
              <div className="side-tab-content">
                <div className="layers-tab-header">
                  <span className="elements-list-hint">
                    เลเยอร์บนสุดแสดงอยู่ด้านหน้าสุด ({Object.values(state.elements).filter((e) => e.visible).length}/{Object.values(state.elements).length} กำลังแสดง):
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
                  {[...orderedLayerIds].reverse().map((id, displayIdx, arr) => {
                    const el = state.elements[id];
                    if (!el) return null;
                    const isTop = displayIdx === 0;
                    const isBottom = displayIdx === arr.length - 1;
                    return (
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
                          {el.label.split(' (')[0]}
                        </button>
                        <div className="layer-row-controls">
                          <button
                            type="button"
                            className="layer-move-btn"
                            disabled={isTop}
                            onClick={() => handleMoveLayer(el.id, 'up')}
                            title="เลื่อนเลเยอร์ขึ้น (นำมาด้านหน้า)"
                            aria-label={`เลื่อน ${el.label} ขึ้น`}
                          >
                            <ChevronUpIcon style={{ width: 13, height: 13 }} />
                          </button>
                          <button
                            type="button"
                            className="layer-move-btn"
                            disabled={isBottom}
                            onClick={() => handleMoveLayer(el.id, 'down')}
                            title="เลื่อนเลเยอร์ลง (ส่งไปด้านหลัง)"
                            aria-label={`เลื่อน ${el.label} ลง`}
                          >
                            <ChevronDownIcon style={{ width: 13, height: 13 }} />
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
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: CARD BACKGROUND ONLY (Solid / Gradient / Image <= 0.99MB, Square Edges Only) */}
            {(activeSideTab === 'card' || activeSideTab === 'cardBg' || activeSideTab === 'tearLine') && (
              <div className="side-tab-content">
                <div className="studio-field">
                  <label htmlFor={getFieldId('bgTypeSelect')} className="studio-label">
                    โหมดพื้นหลังบัตร (Card Background)
                  </label>
                  <select
                    id={getFieldId('bgTypeSelect')}
                    className="studio-select"
                    value={state.bgType === 'gradient' ? 'gradient' : state.bgType === 'image' ? 'image' : 'solid'}
                    onChange={(e) => setState((prev) => ({ ...prev, bgType: e.target.value as BackgroundType }))}
                  >
                    <option value="solid">สีพื้นหลังเรียบ (Solid Color)</option>
                    <option value="gradient">ไล่เฉดสี (Gradient)</option>
                    <option value="image">อัปโหลดรูปภาพพื้นหลัง (Image Upload)</option>
                  </select>
                </div>

                {/* Solid Color (No Swatches) */}
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
                  </div>
                )}

                {/* Gradient */}
                {state.bgType === 'gradient' && (
                  <>
                    <div className="studio-grid-2">
                      <div className="studio-field">
                        <label htmlFor={getFieldId('gradStart')} className="studio-label">สีเริ่มต้น</label>
                        <div className="studio-color-row">
                          <input
                            id={getFieldId('gradStart')}
                            type="color"
                            value={state.gradientStart}
                            onChange={(e) => setState((prev) => ({ ...prev, gradientStart: e.target.value }))}
                          />
                          <input
                            type="text"
                            className="studio-input"
                            value={state.gradientStart}
                            onChange={(e) => setState((prev) => ({ ...prev, gradientStart: e.target.value }))}
                            aria-label="รหัสสีเริ่มต้น"
                          />
                        </div>
                      </div>
                      <div className="studio-field">
                        <label htmlFor={getFieldId('gradEnd')} className="studio-label">สีสิ้นสุด</label>
                        <div className="studio-color-row">
                          <input
                            id={getFieldId('gradEnd')}
                            type="color"
                            value={state.gradientEnd}
                            onChange={(e) => setState((prev) => ({ ...prev, gradientEnd: e.target.value }))}
                          />
                          <input
                            type="text"
                            className="studio-input"
                            value={state.gradientEnd}
                            onChange={(e) => setState((prev) => ({ ...prev, gradientEnd: e.target.value }))}
                            aria-label="รหัสสีสิ้นสุด"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="studio-field">
                      <label htmlFor={getFieldId('gradAngle')} className="studio-label">
                        มุมการไล่เฉด ({state.gradientAngle} องศา)
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

                {/* Image Upload Only (Auto-compressed <= 0.99MB, No URL, No Sample Backgrounds) */}
                {state.bgType === 'image' && (
                  <div className="studio-image-box">
                    <div className="studio-field">
                      <span className="studio-label">อัปโหลดไฟล์รูปภาพพื้นหลังบัตร</span>
                      <input
                        id={getFieldId('uploadBgFile')}
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleTicketImageUpload}
                      />

                      <button
                        type="button"
                        className={`ticket-upload-dropzone ${isDragOverDropzone ? 'dragover' : ''}`}
                        onDragOver={handleDropzoneDragOver}
                        onDragLeave={handleDropzoneDragLeave}
                        onDrop={handleDropzoneDrop}
                        onClick={() => fileInputRef.current?.click()}
                        aria-label="อัปโหลดไฟล์รูปภาพพื้นหลังบัตร"
                      >
                        <div className="dropzone-icon-box">
                          <DownloadIcon style={{ width: 18, height: 18 }} />
                        </div>
                        <span className="dropzone-prompt">คลิกเพื่อเลือกไฟล์รูปภาพ หรือลากมาวาง</span>
                        <span className="dropzone-hint">รองรับ PNG, JPG, WebP (ขนาดไม่เกิน 0.99MB - ลดขนาดอัตโนมัติหากเกิน)</span>
                      </button>
                    </div>

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
                          ลบรูปภาพ
                        </button>
                      </div>
                    )}
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

            {/* TAB 4: DEDICATED FONT TAB (Font Selection, Fine Weights 100-900, Font Upload) */}
            {activeSideTab === 'font' && (
              <div className="side-tab-content">
                <div className="studio-field">
                  <label htmlFor={getFieldId('fontFamilySelect')} className="studio-label">
                    ฟอนต์ตัวอักษรหลักของบัตร (Card Font Family)
                  </label>
                  <select
                    id={getFieldId('fontFamilySelect')}
                    className="studio-select"
                    value={state.fontFamily}
                    onChange={(e) => setState((prev) => ({ ...prev, fontFamily: e.target.value }))}
                  >
                    <option value="Kanit">Kanit (มาตรฐานทันสมัย)</option>
                    <option value="Sarabun">Sarabun (ทางการ ชัดเจน)</option>
                    <option value="Prompt">Prompt (โมเดิร์น คมชัด)</option>
                    <option value="Chakra Petch">Chakra Petch (สปอร์ต ดิจิทัล)</option>
                    {state.customFontName && (
                      <option value={state.customFontName}>{state.customFontName} (ฟอนต์ที่อัปโหลด)</option>
                    )}
                  </select>
                </div>

                {/* Upload Custom Font (.ttf, .otf, .woff, .woff2) */}
                <div className="studio-image-box" style={{ marginTop: '0.25rem' }}>
                  <div className="studio-field">
                    <span className="studio-label">อัปโหลดฟอนต์ใหม่เฉพาะบัตร (Upload Custom Font)</span>
                    <input
                      id={getFieldId('uploadFontFile')}
                      ref={fontInputRef}
                      type="file"
                      accept=".ttf,.otf,.woff,.woff2"
                      style={{ display: 'none' }}
                      onChange={handleCustomFontUpload}
                    />
                    <button
                      type="button"
                      className="ticket-upload-dropzone"
                      disabled={isUploadingFont}
                      onClick={() => fontInputRef.current?.click()}
                      aria-label="อัปโหลดไฟล์ฟอนต์ใหม่"
                    >
                      <div className="dropzone-icon-box">
                        <DownloadIcon style={{ width: 18, height: 18 }} />
                      </div>
                      <span className="dropzone-prompt">
                        {isUploadingFont ? 'กำลังอัปโหลดและติดตั้งฟอนต์...' : 'คลิกเพื่อเลือกไฟล์ฟอนต์'}
                      </span>
                      <span className="dropzone-hint">รองรับ .ttf, .otf, .woff, .woff2 (สูงสุด 2MB)</span>
                    </button>
                  </div>

                  {state.customFontName && (
                    <div className="ticket-upload-preview">
                      <div className="preview-left-group">
                        <span className="preview-file-tag">ฟอนต์ที่ติดตั้ง: {state.customFontName}</span>
                      </div>
                      <button
                        type="button"
                        className="studio-btn secondary"
                        style={{ height: '28px', padding: '0 0.5rem', fontSize: '0.72rem' }}
                        onClick={handleClearCustomFont}
                      >
                        ลบฟอนต์
                      </button>
                    </div>
                  )}
                </div>

                {/* Fine-Grained Font Weight Sliders (100 - 900) */}
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="studio-field">
                    <label htmlFor={getFieldId('titleWeightRange')} className="studio-label">
                      น้ำหนักตัวอักษรหัวข้อทั้งใบ ({state.titleFontWeight ?? 400})
                    </label>
                    <input
                      id={getFieldId('titleWeightRange')}
                      type="range"
                      min={100}
                      max={900}
                      step={100}
                      value={state.titleFontWeight ?? 400}
                      onChange={(e) => setState((prev) => ({ ...prev, titleFontWeight: Number(e.target.value) }))}
                    />
                    <span className="dropzone-hint">100 (บางที่สุด) ถึง 900 (หนาที่สุด)</span>
                  </div>

                  <div className="studio-field">
                    <label htmlFor={getFieldId('bodyWeightRange')} className="studio-label">
                      น้ำหนักตัวอักษรรายละเอียดทั้งใบ ({state.bodyFontWeight ?? 400})
                    </label>
                    <input
                      id={getFieldId('bodyWeightRange')}
                      type="range"
                      min={100}
                      max={900}
                      step={100}
                      value={state.bodyFontWeight ?? 400}
                      onChange={(e) => setState((prev) => ({ ...prev, bodyFontWeight: Number(e.target.value) }))}
                    />
                    <span className="dropzone-hint">สามารถปรับเพิ่ม/ลดเฉพาะรายชิ้นส่วนได้ในแท็บ ชิ้นส่วน</span>
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
