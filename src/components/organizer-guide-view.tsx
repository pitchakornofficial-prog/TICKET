'use client';

import { useState, useEffect } from 'react';
import {
  BookOpenIcon,
  QrCodeIcon,
  BanknotesIcon,
  CalendarIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
} from '@/components/icons';
import { TicketIcon } from '@/components/ticket-icon';

interface GuideStep {
  stepNum: number;
  title: string;
  summary: string;
  details: string[];
  notice?: string;
}

interface GuideModule {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  icon: 'qrcode' | 'ticket' | 'banknotes' | 'calendar';
  relatedTab?: string;
  relatedTabLabel?: string;
  steps: GuideStep[];
}

const GUIDE_MODULES: GuideModule[] = [
  {
    id: 'scanning',
    title: 'ระบบสแกนบัตรและควบคุมประตูเข้างาน',
    subtitle: 'คู่มือการทำงานของทีมสแกน กติกาเครื่องหลักออฟไลน์ และการรับมือเหตุฉุกเฉินหน้างาน',
    badge: 'สำคัญมากสำหรับวันงาน',
    icon: 'qrcode',
    relatedTab: 'scanners',
    relatedTabLabel: 'ไปที่หน้าทีมงานสแกนบัตร',
    steps: [
      {
        stepNum: 1,
        title: 'การสร้างและแจกจ่ายบัญชีทีมสแกน',
        summary: 'ผู้จัดงานสามารถสร้างบัญชีทีมงานเฉพาะกิจสำหรับแต่ละคอนเสิร์ตได้จากแท็บ "ทีมงาน"',
        details: [
          'เข้าสู่แท็บ "ทีมงาน" แล้วเลือกแท็บ "สร้างบัญชีใหม่"',
          'เลือกคอนเสิร์ตที่ต้องการ กำหนดชื่อผู้ใช้งาน อีเมล และรหัสผ่านความปลอดภัย (อย่างน้อย 15 ตัวอักษร)',
          'ส่งมอบอีเมลและรหัสผ่านให้กับเจ้าหน้าที่ประจำประตูทางเข้า (ทีมสแกนจะมีสิทธิ์เข้าถึงเฉพาะงานที่ได้รับมอบหมายเท่านั้น)',
        ],
      },
      {
        stepNum: 2,
        title: 'โหมดสแกนออนไลน์และเครื่องหลักออฟไลน์ (Primary Machine)',
        summary: 'เพื่อป้องกันการสแกนซ้ำข้ามประตู ระบบอนุญาตให้มีเครื่องหลักออฟไลน์ได้เพียง 1 เครื่องต่อคอนเสิร์ต',
        details: [
          'เครื่องสแกนทั่วไปทำงานในโหมดออนไลน์ เชื่อมต่อฐานข้อมูลกลางแบบเรียลไทม์เพื่อตรวจสอบสิทธิ์ทันที',
          'กรณีสัญญาณอินเทอร์เน็ตหน้างานขัดข้อง เครื่องที่ได้รับสิทธิ์เป็น "เครื่องหลัก (Primary Scanner)" จะสามารถดาวน์โหลดชุดข้อมูลบัตรและสแกนตรวจบัตรออฟไลน์ได้อย่างถูกต้อง',
          'เมื่ออินเทอร์เน็ตกลับมาใช้งานได้ เครื่องหลักจะทำการซิงก์ข้อมูลการเข้างาน (Admissions Sync) กลับสู่ระบบอัตโนมัติ',
        ],
        notice: 'ห้ามเปิดใช้งานโหมดออฟไลน์บนหลายเครื่องพร้อมกันโดยไม่ผ่านการส่งมอบ เพื่อรักษาความถูกต้องของยอดผู้เข้าชม',
      },
      {
        stepNum: 3,
        title: 'กติกาสแกนบัตรออกแล้วกลับเข้างานใหม่ (Re-entry Policy)',
        summary: 'ระบบรองรับผู้ชมที่ต้องการออกจากพื้นที่จัดงานชั่วคราวและกลับเข้ามาใหม่ตามกติกา G-07=B',
        details: [
          'หากผู้ชมต้องการออกจากงานชั่วคราว เจ้าหน้าที่ต้องสแกนเพื่อบันทึกสถานะ "ออก (Check-out)" ก่อนเสมอ',
          'เมื่อผู้ชมกลับเข้ามาใหม่ เจ้าหน้าที่สแกนซ้ำเพื่อบันทึกสถานะ "กลับเข้างาน (Re-entry)"',
          'หากบัตรยังอยู่ในสถานะ "เข้างานแล้ว" และไม่มีการบันทึกออก ระบบจะปฏิเสธการสแกนเข้าซ้ำเพื่อความปลอดภัย',
        ],
      },
      {
        stepNum: 4,
        title: 'การส่งมอบเครื่องหลัก (Handover) และการระงับฉุกเฉิน (Emergency Stop)',
        summary: 'ขั้นตอนการรับมือกรณีเครื่องสแกนหลักแบตเตอรี่หมด สูญหาย หรือขัดข้องหน้างาน',
        details: [
          'กรณีต้องเปลี่ยนเครื่อง: ผู้จัดงานสามารถกดปุ่ม "สลับเครื่องหลัก (Handover)" ในระบบเพื่อโอนสิทธิ์เครื่องหลักไปยังเครื่องสำรองอย่างปลอดภัย',
          'กรณีเครื่องหลักชำรุดกะทันหัน: กดปุ่ม "แจ้งเครื่องหลักชำรุด / ระงับออฟไลน์ (Emergency Stop)" ระบบจะหยุดการกระทบยอดออฟไลน์ทันทีเพื่อป้องกันข้อมูลขัดแย้ง',
          'หลังจากตรวจเช็กเรียบร้อย ผู้จัดงานสามารถกดปุ่ม "ปลดระงับ (Resume)" เพื่อกลับมาใช้งานตามปกติ',
        ],
      },
    ],
  },
  {
    id: 'concerts',
    title: 'การจัดการงานคอนเสิร์ตและรอบการแสดง',
    subtitle: 'ขั้นตอนการสร้างคอนเสิร์ต ตั้งค่าประเภทบัตร ส่งตรวจอนุมัติ และการยื่นแก้ไขรอบ',
    badge: 'ขั้นตอนเบื้องต้น',
    icon: 'ticket',
    relatedTab: 'events',
    relatedTabLabel: 'ไปที่หน้าคอนเสิร์ตของฉัน',
    steps: [
      {
        stepNum: 1,
        title: 'การสร้างงานคอนเสิร์ตและตั้งค่าบัตร',
        summary: 'กรอกรายละเอียดงาน วันเวลา สถานที่ และกำหนดประเภทบัตรแต่ละโซน',
        details: [
          'เข้าสู่แท็บ "คอนเสิร์ต" แล้วกดปุ่ม "+ สร้างงานคอนเสิร์ตใหม่"',
          'กรอกชื่อคอนเสิร์ต ข้อมูลศิลปิน สถานที่จัดงาน พร้อมรอบวันและเวลาการแสดง',
          'กำหนดประเภทบัตร (เช่น VIP, บัตรยืน Zone A, บัตรนั่ง Zone B) ราคา และจำนวนโควตาที่เปิดจำหน่าย',
        ],
      },
      {
        stepNum: 2,
        title: 'การส่งให้เจ้าของระบบตรวจสอบและอนุมัติ',
        summary: 'คอนเสิร์ตที่สร้างใหม่จะอยู่ในสถานะฉบับร่าง (Draft) จนกว่าจะผ่านการอนุมัติ',
        details: [
          'ตรวจสอบข้อมูลรอบการแสดงและราคาบัตรให้เรียบร้อย แล้วกดยื่นขออนุมัติเปิดจำหน่าย',
          'เจ้าของระบบจะทำการตรวจสอบความถูกต้องของข้อมูลและนโยบายภายใน 24 ชม.',
          'เมื่อได้รับการอนุมัติ งานคอนเสิร์ตจะขึ้นสู่หน้าแรกและเปิดจำหน่ายบัตรสู่สาธารณะทันที',
        ],
      },
      {
        stepNum: 3,
        title: 'การยื่นขอแก้ไขรอบการแสดง (Amendment Request)',
        summary: 'หากมีความจำเป็นต้องเปลี่ยนวันเวลา สถานที่ หรือรายละเอียดรอบการแสดงที่เปิดขายแล้ว',
        details: [
          'กดปุ่ม "ยื่นขอแก้ไขรอบ" บนการ์ดคอนเสิร์ตที่ต้องการ',
          'ระบุวันเวลาใหม่ เหตุผลความจำเป็นในการแก้ไข และรายละเอียดที่ต้องการปรับปรุง',
          'เมื่อเจ้าของระบบอนุมัติ ระบบจะส่งอีเมลแจ้งเตือนการเปลี่ยนแปลงไปยังผู้ซื้อบัตรทุกคนโดยอัตโนมัติ',
        ],
      },
      {
        stepNum: 4,
        title: 'การขอยกเลิกรอบการแสดงและนโยบายการคืนเงิน',
        summary: 'กรณีเกิดเหตุสุดวิสัยที่ไม่สามารถจัดการแสดงได้',
        details: [
          'กดปุ่ม "ขอยกเลิกรอบการแสดง" และระบุเหตุผลอย่างละเอียด',
          'ระบบจะเปิดช่วงเวลาขอคืนเงินพิเศษ (Special Refund Window) ให้แก่ผู้ชมโดยอัตโนมัติ',
          'เจ้าของระบบจะเป็นผู้อนุมัติและโอนเงินคืนค่าบัตรเข้าบัญชีของผู้ซื้อโดยตรงตามกติกาแพลตฟอร์ม',
        ],
      },
    ],
  },
  {
    id: 'finance',
    title: 'ระบบการเงิน รอบการโอนเงิน และเงินสำรอง',
    subtitle: 'ทำความเข้าใจโครงสร้างค่าบริการ ค่าหักเงินสำรอง และกำหนดการจ่ายเงินรายสัปดาห์',
    badge: 'ข้อมูลการเงิน',
    icon: 'banknotes',
    relatedTab: 'finance',
    relatedTabLabel: 'ไปที่หน้ารายงานการเงิน',
    steps: [
      {
        stepNum: 1,
        title: 'โครงสร้างค่าบริการและยอดจำหน่ายรวม (Gross Sales)',
        summary: 'ยอดเงินทั้งหมดที่ผู้ชมชำระผ่าน PromptPay QR จะถูกบันทึกอย่างโปร่งใส',
        details: [
          'ยอดจำหน่ายรวม (Gross Sales): คำนวณจากราคาบัตรทั้งหมดที่ชำระเงินสำเร็จแล้ว (Paid Orders)',
          'ค่าบริการแพลตฟอร์ม 5%: หักจากยอดจำหน่ายรวมสำหรับค่าธรรมเนียมระบบและการบริหารจัดการ',
          'ผู้จัดงานสามารถตรวจสอบยอดเงินและสัดส่วนประเภทบัตรได้แบบเรียลไทม์ในหน้ารายงานการเงิน',
        ],
      },
      {
        stepNum: 2,
        title: 'การหักเงินสำรอง 10% (Reserve Fund)',
        summary: 'เงินสำรองเพื่อเป็นหลักประกันกรณีมีคำขอคืนเงินหรือข้อพิพาทจนกว่าคอนเสิร์ตจะเสร็จสิ้น',
        details: [
          'ระบบจะกันเงินสำรอง 10% จากยอดจำหน่ายสุทธิไว้ในกองทุนสำรองของงานคอนเสิร์ตนั้น',
          'เงินสำรองนี้จะถูกปลดล็อกและโอนคืนให้แก่ผู้จัดงานหลังจากการแสดงเสร็จสิ้นและพ้นกำหนดการขอคืนเงิน',
          'หากมีการคืนเงินให้ผู้ชม ยอดเงินคืนจะถูกหักออกจากกองทุนสำรองนี้เป็นลำดับแรก',
        ],
      },
      {
        stepNum: 3,
        title: 'รอบการโอนจ่ายรายสัปดาห์ (Weekly Payout)',
        summary: 'กำหนดการโอนเงินค่าบัตรเข้าบัญชีธนาคารของผู้จัดงาน',
        details: [
          'เจ้าของระบบจะทำการสรุปยอดและโอนเงินสุทธิให้แก่ผู้จัดงานเป็นประจำทุกสัปดาห์ตามรอบที่กำหนด',
          'การโอนเงินทุกครั้งจะมีหลักฐานสลิปการโอนเงิน (Transfer Proof) บันทึกแนบไว้ในระบบให้ตรวจสอบได้ตลอดเวลา',
        ],
      },
      {
        stepNum: 4,
        title: 'การตั้งค่าบัญชีธนาคารสำหรับรับเงิน',
        summary: 'ตรวจสอบและจัดการบัญชีรับเงินให้ถูกต้องเพื่อป้องกันการโอนเงินล่าช้า',
        details: [
          'เข้าสู่แท็บ "ตั้งค่า" แล้วเลื่อนไปที่ส่วน "บัญชีธนาคารสำหรับรับเงิน"',
          'สามารถเพิ่มบัญชีธนาคารได้สูงสุด 3 บัญชี และกำหนด 1 บัญชีให้เป็น "บัญชีหลัก"',
          'โปรดตรวจสอบชื่อบัญชีและเลขที่บัญชีให้ตรงกับข้อมูลนิติบุคคลหรือชื่อผู้จัดงาน',
        ],
      },
    ],
  },
  {
    id: 'news',
    title: 'การประชาสัมพันธ์ ข่าวสาร และประกาศงาน',
    subtitle: 'แนวทางการเขียนข่าวคอนเสิร์ต สัดส่วนภาพปก และการส่งขออนุมัติเผยแพร่',
    badge: 'การสื่อสารและ PR',
    icon: 'calendar',
    relatedTab: 'news',
    relatedTabLabel: 'ไปที่หน้าจัดการข่าวสาร',
    steps: [
      {
        stepNum: 1,
        title: 'การเขียนข่าวสารและประกาศสำคัญ',
        summary: 'สื่อสารข้อมูลศิลปิน ผังที่นั่ง การเดินทาง และโปรโมชันพิเศษสู่ผู้ชม',
        details: [
          'เข้าสู่แท็บ "ข่าวสาร" แล้วกดปุ่ม "+ เขียนข่าวสารใหม่"',
          'กรอกพาดหัวข่าว เลือกหมวดหมู่ (ประชาสัมพันธ์, ประกาศสำคัญ, กิจกรรมและสิทธิพิเศษ, อัปเดต)',
          'ผูกข่าวเข้ากับคอนเสิร์ตที่เกี่ยวข้องเพื่อให้นำทางไปยังหน้าจองบัตรได้ง่าย',
        ],
      },
      {
        stepNum: 2,
        title: 'มาตรฐานสัดส่วนภาพปก 16:9 และระบบเติมขอบเบลอ',
        summary: 'เพื่อให้ภาพปกข่าวดูสวยงามและไม่ถูกตัดขอบบนทุกหน้าจอ',
        details: [
          'ระบบแนะนำให้อัปโหลดภาพปกแนวนอนสัดส่วน 16:9 (เช่น ขนาด 1280x720 หรือ 1920x1080 px)',
          'หากภาพที่อัปโหลดไม่ใช่ 16:9 ระบบจะเปิดใช้งาน "Smart Blurred Backdrop" เพื่อเติมขอบข้างให้กลมกลืนโดยไม่ตัดขอบภาพต้นฉบับ',
          'หากยังไม่มีภาพปก ระบบจะแสดงโลโก้ TICKET สีดำมาตรฐานอย่างสง่างามโดยอัตโนมัติ',
        ],
      },
      {
        stepNum: 3,
        title: 'การดูตัวอย่างเสมือนจริง (Live Preview) ก่อนส่งอนุมัติ',
        summary: 'ตรวจทานหน้าตาบทความเหมือนที่ผู้ชมจะเห็นบนหน้าเว็บจริง',
        details: [
          'กดปุ่ม "ดูตัวอย่าง (Preview)" เพื่อเปิดหน้าต่างจำลองบทความจริง',
          'ตรวจสอบความถูกต้องของเนื้อหา ย่อหน้า และความคมชัดของภาพปก',
          'สามารถกดบันทึกเป็น "ฉบับร่าง" เพื่อกลับมาแก้ไขต่อ หรือกด "ส่งให้เจ้าของอนุมัติ" เมื่อพร้อม',
        ],
      },
      {
        stepNum: 4,
        title: 'การติดตามสถานะบทความและการแก้ไขเมื่อถูกส่งกลับ',
        summary: 'สถานะข่าวสาร 4 ระดับ: ฉบับร่าง, รออนุมัติ, เผยแพร่แล้ว, ส่งกลับแก้ไข',
        details: [
          'ฉบับร่าง (Draft): ข่าวสารที่กำลังเขียน ยังไม่ส่งตรวจสอบ แก้ไขได้ตลอดเวลา',
          'รออนุมัติ (Pending): ส่งให้เจ้าของระบบตรวจสอบแล้ว รอการอนุมัติเพื่อเผยแพร่',
          'เผยแพร่แล้ว (Published): ผ่านการอนุมัติและแสดงผลบนหน้าข่าวสารหลักเรียบร้อย',
          'ส่งกลับแก้ไข (Rejected): เจ้าของระบบระบุเหตุผลที่ต้องปรับปรุง ผู้จัดสามารถแก้ไขและส่งขออนุมัติใหม่ได้ทันที',
        ],
      },
    ],
  },
];

export function OrganizerGuideView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    scanning: true,
    concerts: true,
    finance: true,
    news: true,
  });
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 300);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => ({
      ...prev,
      [moduleId]: !prev[moduleId],
    }));
  };

  const filteredModules = GUIDE_MODULES.filter((mod) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const matchTitle = mod.title.toLowerCase().includes(query);
    const matchSub = mod.subtitle.toLowerCase().includes(query);
    const matchStep = mod.steps.some(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        s.summary.toLowerCase().includes(query) ||
        s.details.some((d) => d.toLowerCase().includes(query)),
    );
    return matchTitle || matchSub || matchStep;
  });

  const renderModuleIcon = (iconType: GuideModule['icon']) => {
    switch (iconType) {
      case 'qrcode':
        return <QrCodeIcon width={24} height={24} />;
      case 'ticket':
        return <TicketIcon style={{ width: '24px', height: '24px' }} />;
      case 'banknotes':
        return <BanknotesIcon width={24} height={24} />;
      case 'calendar':
        return <CalendarIcon width={24} height={24} />;
      default:
        return <BookOpenIcon width={24} height={24} />;
    }
  };

  return (
    <div className="organizer-guide-page" data-testid="organizer-guide-view">
      <div className="guide-page-container">
        {/* Header Toolbar */}
        <header className="guide-page-header">
          <div className="guide-header-text">
            <h1 className="guide-page-title">คู่มือการใช้งานระบบสำหรับผู้จัดงาน</h1>
            <p className="guide-page-desc">
              รวบรวมแนวทางปฏิบัติ ขั้นตอนการทำงาน และกฎเกณฑ์สำคัญในการจัดการคอนเสิร์ต การสแกนบัตร และการเงินบนแพลตฟอร์ม TICKET
            </p>
          </div>

          {/* Search Bar */}
          <div className="guide-search-wrap">
            <input
              type="text"
              className="guide-search-input"
              placeholder="ค้นหาหัวข้อคู่มือ เช่น การสแกน, เครื่องหลัก, ขอคืนเงิน, ค่าบริการ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="ค้นหาหัวข้อคู่มือ"
            />
            {searchQuery && (
              <button
                type="button"
                className="guide-search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label="ล้างคำค้นหา"
              >
                ล้างคำค้น
              </button>
            )}
          </div>
        </header>

        {/* Modules List */}
        <div className="guide-modules-list">
          {filteredModules.length === 0 ? (
            <div className="guide-empty-state">
              <BookOpenIcon width={40} height={40} />
              <h2 className="guide-empty-title">ไม่พบหัวข้อคู่มือที่ตรงกับ &quot;{searchQuery}&quot;</h2>
              <p className="guide-empty-desc">ลองค้นหาด้วยคำสั้น ๆ หรือกดปุ่มด้านล่างเพื่อแสดงคู่มือทั้งหมด</p>
              <button
                type="button"
                className="guide-reset-btn"
                onClick={() => setSearchQuery('')}
              >
                ดูคู่มือทั้งหมด
              </button>
            </div>
          ) : (
            filteredModules.map((module) => {
              const isExpanded = !!expandedModules[module.id];
              return (
                <section
                  key={module.id}
                  id={module.id}
                  className={`guide-module-card ${isExpanded ? 'is-expanded' : ''}`}
                  aria-labelledby={`module-heading-${module.id}`}
                >
                  {/* Module Header Bar */}
                  <button
                    type="button"
                    className="guide-module-header"
                    onClick={() => toggleModule(module.id)}
                    aria-expanded={isExpanded}
                  >
                    <div className="guide-module-header-left">
                      <div className={`guide-module-icon-wrap icon-${module.id}`}>
                        {renderModuleIcon(module.icon)}
                      </div>
                      <div className="guide-module-title-col">
                        <div className="guide-module-meta-row">
                          <span className="guide-module-badge">{module.badge}</span>
                          <span className="guide-steps-count">{module.steps.length} ขั้นตอนสำคัญ</span>
                        </div>
                        <h2 id={`module-heading-${module.id}`} className="guide-module-title">
                          {module.title}
                        </h2>
                        <p className="guide-module-subtitle">{module.subtitle}</p>
                      </div>
                    </div>

                    <div className="guide-module-header-right">
                      <div className={`guide-chevron-wrap ${isExpanded ? 'open' : ''}`}>
                        <ChevronDownIcon width={20} height={20} />
                      </div>
                    </div>
                  </button>

                  {/* Module Content: Steps */}
                  {isExpanded && (
                    <div className="guide-module-body">
                      <div className="guide-steps-timeline">
                        {module.steps.map((step) => (
                          <div key={step.stepNum} className="guide-step-item">
                            <div className="guide-step-marker">
                              <span className="guide-step-num">{step.stepNum}</span>
                              <div className="guide-step-line" />
                            </div>

                            <div className="guide-step-content-card">
                              <div className="guide-step-header">
                                <h3 className="guide-step-title">{step.title}</h3>
                              </div>
                              <p className="guide-step-summary">{step.summary}</p>

                              <ul className="guide-step-details-list">
                                {step.details.map((detail, idx) => (
                                  <li key={String(idx)} className="guide-detail-row">
                                    <div className="detail-check-wrap">
                                      <CheckCircleIcon width={16} height={16} />
                                    </div>
                                    <span>{detail}</span>
                                  </li>
                                ))}
                              </ul>

                              {step.notice && (
                                <div className="guide-step-notice" role="note">
                                  <AlertTriangleIcon width={16} height={16} />
                                  <span>{step.notice}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Related Tab Footer Link */}
                      {module.relatedTab && module.relatedTabLabel && (
                        <div className="guide-module-footer">
                          <a
                            href={`#${module.relatedTab}`}
                            className="guide-related-tab-btn"
                            onClick={(e) => {
                              e.preventDefault();
                              if (window.history?.replaceState) {
                                window.history.replaceState(null, '', `#${module.relatedTab}`);
                              }
                              window.dispatchEvent(new HashChangeEvent('hashchange'));
                            }}
                          >
                            <span>{module.relatedTabLabel} &rarr;</span>
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>

      {/* Floating Back to Top Button (D-87 / Benchmark D-78) */}
      {showScrollTop && (
        <button
          type="button"
          className="floating-back-to-top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          title="กลับสู่ด้านบนสุด"
          aria-label="กลับสู่ด้านบนสุด"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
