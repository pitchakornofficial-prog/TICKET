'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  BanknotesIcon,
  CalendarIcon,
  QrCodeIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  PrinterIcon,
  SearchIcon,
  XIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@/components/icons';
import { Button, Badge } from '@/components/ui';

export type PolicyCategory = 'all' | 'finance' | 'amendment' | 'scanning' | 'legal';

export interface PolicyTermItem {
  number: string;
  title: string;
  content: string;
}

export interface PolicySection {
  id: string;
  category: 'finance' | 'amendment' | 'scanning' | 'legal';
  title: string;
  subtitle: string;
  badge: string;
  icon: 'banknotes' | 'calendar' | 'qrcode' | 'shield';
  keyTakeaways: string[];
  terms: PolicyTermItem[];
}

const POLICY_SECTIONS: PolicySection[] = [
  {
    id: 'finance',
    category: 'finance',
    title: 'การเงิน ค่าธรรมเนียม และรอบจ่ายเงิน',
    subtitle: 'มาตรการคำนวณส่วนแบ่งรายได้ การหักค่าบริการแพลตฟอร์ม รอบการโอนเงินสุทธิ และความรับผิดชอบหนี้สิน',
    badge: 'การเงินและรอบโอน',
    icon: 'banknotes',
    keyTakeaways: [
      'หักค่าบริการแพลตฟอร์ม 3% สำหรับบัตรราคาพิเศษ/โปรโมชัน และ 5% สำหรับราคาบัตรทั่วไปตามข้อกำหนด (AC-64, AC-77, G-42)',
      'ตัดรอบยอดขายทุกคืนวันอาทิตย์ และดำเนินการโอนเงินสุทธิเข้าบัญชีหลักของผู้จัดงานทุกวันจันทร์สัปดาห์ถัดไป (AC-78)',
      'ผู้จัดงานมีหน้าที่รับผิดชอบหนี้สิน ค่าธรรมเนียม และส่วนต่างทางการเงินคงค้างทั้งหมดกรณีเกิดข้อพิพาทหรือยอดติดลบ (AC-37)',
    ],
    terms: [
      {
        number: '1.1',
        title: 'อัตราค่าบริการระบบ (Platform Fee)',
        content:
          'แพลตฟอร์ม TICKET คิดค่าบริการเป็นอัตราร้อยละจากมูลค่าหน้าบัตรที่จำหน่ายได้จริง (3% สำหรับบัตรโปรโมชัน และ 5% สำหรับบัตรราคาปกติ) โดยระบบจะคำนวณและหักค่าบริการอัตโนมัติก่อนนำส่งยอดเงินสุทธิให้แก่ผู้จัดงาน',
      },
      {
        number: '1.2',
        title: 'รอบการตัดยอดและการโอนเงิน (Payout Schedule)',
        content:
          'ระบบจะทำการตัดรอบยอดขายในวันอาทิตย์ เวลา 23:59:59 น. ของทุกสัปดาห์ และเจ้าของระบบจะดำเนินการตรวจสอบพร้อมโอนเงินสุทธิเข้าบัญชีธนาคารหลักของผู้จัดงานภายในวันจันทร์ถัดไป พร้อมแนบหลักฐานการโอนในระบบ',
      },
      {
        number: '1.3',
        title: 'บัญชีธนาคารสำหรับรับเงิน',
        content:
          'ผู้จัดงานมีหน้าที่ตรวจสอบและรักษาความถูกต้องของข้อมูลบัญชีธนาคารหลักในหน้าตั้งค่า หากมีการเปลี่ยนแปลงข้อมูลบัญชี จะต้องดำเนินการล่วงหน้าอย่างน้อย 2 วันทำการก่อนรอบการตัดยอดประจำสัปดาห์',
      },
      {
        number: '1.4',
        title: 'ความรับผิดชอบในภาระหนี้สินคงค้าง (Outstanding Debt)',
        content:
          'กรณีเกิดเหตุการณ์คืนเงิน ข้อพิพาทการชำระเงิน หรือการยกเลิกงานที่ส่งผลให้ยอดคงเหลือสุทธิติดลบ ผู้จัดงานตกลงและยินยอมชำระหนี้สินส่วนต่างคืนแก่แพลตฟอร์ม TICKET ภายใน 7 วันทำการนับจากวันที่ได้รับแจ้งเป็นลายลักษณ์อักษร',
      },
    ],
  },
  {
    id: 'amendment',
    category: 'amendment',
    title: 'การแก้ไขราคา รอบการแสดง และการยกเลิกงาน',
    subtitle: 'เงื่อนไขการยื่นขอปรับเปลี่ยนเวลาการแสดง การเปลี่ยนแปลงราคาบัตร นโยบายการเลื่อนรอบ และการยกเลิกคอนเสิร์ต',
    badge: 'รอบการแสดงและยกเลิก',
    icon: 'calendar',
    keyTakeaways: [
      'การปรับราคาบัตร หรือแก้ไขวันเวลารอบการแสดง ต้องยื่นคำขอและได้รับการอนุมัติจากเจ้าของระบบ (Owner) ก่อนมีผล (G-13, AC-34)',
      'กรณีเลื่อนรอบการแสดง (Reschedule) ระบบจะเปิดสิทธิ์ให้ผู้ซื้อยื่นขอคืนเงินเต็มจำนวนเป็นเวลาอย่างน้อย 14 วัน (AC-38, AC-108)',
      'กรณียกเลิกงานคอนเสิร์ต (Cancellation) ต้องคืนเงินให้ผู้ซื้อ 100% เต็มจำนวนรวมถึงค่าธรรมเนียมทั้งหมดทันที (AC-35)',
    ],
    terms: [
      {
        number: '2.1',
        title: 'การยื่นคำขอแก้ไขราคาและรอบการแสดง (Amendment Request)',
        content:
          'เมื่อคอนเสิร์ตได้รับการอนุมัติแล้ว ผู้จัดงานไม่สามารถแก้ไขราคาบัตรหรือวันเวลารอบการแสดงได้โดยตรง หากจำเป็นต้องปรับเปลี่ยน จะต้องส่งคำขอแก้ไขพร้อมระบุเหตุผลผ่านระบบ เพื่อให้เจ้าของแพลตฟอร์มพิจารณาอนุมัติตามมาตรการความปลอดภัยของผู้ซื้อ',
      },
      {
        number: '2.2',
        title: 'นโยบายกรณีเลื่อนรอบการแสดง (Reschedule Policy)',
        content:
          'หากผู้จัดงานประกาศเลื่อนวันหรือเวลาการแสดง คอนเสิร์ตจะเข้าสู่ช่วงคุ้มครองสิทธิผู้บริโภค โดยระบบจะส่งอีเมลแจ้งผู้ถือบัตรทุกคน และเปิดระบบให้ผู้ซื้อสามารถเลือกได้ว่าจะใช้บัตรในรอบใหม่ หรือยื่นคำขอคืนเงินเต็มจำนวนภายในระยะเวลา 14 วัน',
      },
      {
        number: '2.3',
        title: 'นโยบายกรณียกเลิกการจัดคอนเสิร์ต (Cancellation Policy)',
        content:
          'กรณีผู้จัดงานประกาศยกเลิกการแสดงทั้งหมด ระบบจะระงับการโอนเงินส่วนแบ่งทันที และเริ่มกระบวนการคืนเงิน 100% เต็มจำนวน (รวมราคาบัตรและค่าบริการ) คืนสู่บัญชีของผู้ซื้อทุกราย โดยผู้จัดงานยังคงมีภาระรับผิดชอบค่าใช้จ่ายในการดำเนินธุรกรรมที่เกิดขึ้นจริง',
      },
      {
        number: '2.4',
        title: 'เหตุสุดวิสัยและภัยพิบัติ (Force Majeure)',
        content:
          'กรณีเกิดเหตุสุดวิสัย เช่น ภัยธรรมชาติ คำสั่งฉุกเฉินจากทางราชการ หรือสถานการณ์ความไม่สงบ ผู้จัดงานและแพลตฟอร์มตกลงร่วมมือกันเพื่อบรรเทาผลกระทบ ประสานงานแจ้งข้อมูลแก่ผู้ชมอย่างโปร่งใส และดำเนินการคืนเงินตามข้อตกลงร่วมกัน',
      },
    ],
  },
  {
    id: 'scanning',
    category: 'scanning',
    title: 'ระบบสแกนเนอร์และการควบคุมประตู',
    subtitle: 'กติกาการผูกอุปกรณ์สแกนบัตร สิทธิ์เครื่องหลักโหมดออฟไลน์ และมาตรการตรวจนับผู้เข้างาน',
    badge: 'การสแกนและควบคุมประตู',
    icon: 'qrcode',
    keyTakeaways: [
      'ลิงก์และ QR Code สำหรับเข้าหน้าสแกน 1 สิทธิ์ สามารถผูกใช้งานได้เพียง 1 อุปกรณ์เท่านั้นเพื่อความปลอดภัย (D-104)',
      'ระบบอนุญาตให้มีเครื่องหลักโหมดออฟไลน์ได้เพียง 1 เครื่องต่อคอนเสิร์ต เพื่อป้องกันการสแกนบัตรซ้ำข้ามประตู (G-41)',
      'กติกาเข้า-ออกงาน (Re-entry) ต้องสแกนบันทึกสถานะ "ออก" ก่อนเสมอ จึงจะสามารถสแกนกลับเข้างานได้ (G-07=B)',
    ],
    terms: [
      {
        number: '3.1',
        title: 'การผูกอุปกรณ์เข้าใช้งาน (Single-Device Binding)',
        content:
          'รหัสลิงก์และ QR Code ประจำตัวเจ้าหน้าที่สแกนบัตรจะถูกผูกกับอุปกรณ์แรกที่เข้าใช้งานโดยอัตโนมัติ ไม่อนุญาตให้เปิดใช้งานซ้ำจากอุปกรณ์อื่น หากอุปกรณ์สูญหายหรือชำรุดหน้างาน ผู้จัดงานสามารถกดปุ่ม "รีเซ็ตอุปกรณ์" จากหลังบ้านเพื่ออนุญาตให้อุปกรณ์ใหม่เข้าใช้งานแทนได้',
      },
      {
        number: '3.2',
        title: 'สิทธิ์เครื่องหลักออฟไลน์ (Primary Offline Scanner)',
        content:
          'เพื่อป้องกันปัญหาบัตรใบเดียวกันถูกนำไปสแกนพร้อมกันในขณะที่เครือข่ายอินเทอร์เน็ตหน้างานขัดข้อง ระบบจะมอบสิทธิ์โหมดออฟไลน์ให้เฉพาะ "เครื่องหลักของผู้จัดงาน" เพียง 1 เครื่องต่อคอนเสิร์ตเท่านั้น เจ้าหน้าที่เสริมจะต้องทำงานผ่านระบบออนไลน์',
      },
      {
        number: '3.3',
        title: 'การซิงก์ข้อมูลการเข้างาน (Admissions Synchronization)',
        content:
          'เมื่อเครื่องหลักออฟไลน์กลับมาเชื่อมต่อเครือข่ายอินเทอร์เน็ตได้ ผู้จัดงานหรือเจ้าหน้าที่มีหน้าที่กดปุ่ม "ซิงก์ข้อมูลค้าง" ทันที เพื่อนำส่งประวัติการตรวจบัตรขึ้นสู่ฐานข้อมูลกลาง ให้ยอดผู้เข้าร่วมงานมีความสอดคล้องกัน',
      },
      {
        number: '3.4',
        title: 'กติกาการออกและกลับเข้างานใหม่ (Re-entry Protocol)',
        content:
          'บัตรคอนเสิร์ตที่ผ่านการตรวจเข้างานแล้วจะมีสถานะ "เข้างานแล้ว" หากผู้ชมต้องการออกจากบริเวณงานชั่วคราว เจ้าหน้าที่ต้องสแกนเพื่อเปลี่ยนสถานะเป็น "ออกงานแล้ว" ก่อนเสมอ จึงจะสามารถสแกนกลับเข้างานใหม่ได้ หากไม่มีการบันทึกออก ระบบจะปฏิเสธการสแกนทันที',
      },
    ],
  },
  {
    id: 'legal',
    category: 'legal',
    title: 'ความรับผิดชอบทางกฎหมายและข้อมูลส่วนบุคคล',
    subtitle: 'การคุ้มครองข้อมูลส่วนบุคคลตาม พ.ร.บ. PDPA มาตรการความปลอดภัย และการระงับสิทธิ์กรณีละเมิดสัญญา',
    badge: 'กฎหมายและ PDPA',
    icon: 'shield',
    keyTakeaways: [
      'ผู้จัดงานต้องปฏิบัติตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) อย่างเคร่งครัด ห้ามนำข้อมูลผู้ซื้อไปแสวงหาผลประโยชน์อื่น',
      'ห้ามสร้างโควตาบัตรเท็จ จำหน่ายเกินจำนวนความจุจริงของสถานที่ หรือหลอกลวงผู้บริโภคในทุกกรณี',
      'แพลตฟอร์มมีสิทธิ์ระงับการให้บริการและระงับการโอนเงินทันทีหากตรวจพบการทุจริตหรือการละเมิดสัญญาอย่างร้ายแรง',
    ],
    terms: [
      {
        number: '4.1',
        title: 'การคุ้มครองข้อมูลส่วนบุคคลของผู้ซื้อ (PDPA Compliance)',
        content:
          'ข้อมูลชื่อ นามสกุล อีเมล เบอร์โทรศัพท์ และพฤติกรรมการเข้าชมของผู้ซื้อ ถือเป็นข้อมูลส่วนบุคคลที่ได้รับความคุ้มครองตามกฎหมาย ผู้จัดงานได้รับอนุญาตให้เข้าถึงและใช้งานข้อมูลดังกล่าวเพื่อวัตถุประสงค์ในการจัดงานคอนเสิร์ตและการควบคุมทางเข้าเท่านั้น ห้ามมิให้นำไปจำหน่าย ส่งต่อ หรือใช้เพื่อประโยชน์ทางการค้าอื่นโดยไม่ได้รับความยินยอมจากเจ้าของข้อมูล',
      },
      {
        number: '4.2',
        title: 'ความซื่อสัตย์และการกำหนดโควตาบัตร (Ticket Quota Integrity)',
        content:
          'ผู้จัดงานต้องระบุจำนวนโควตาบัตร ราคา และแผนผังพื้นที่ตามความเป็นจริง ห้ามตั้งโควตาจำหน่ายเกินกว่าความจุสูงสุดที่ได้รับอนุญาตตามกฎหมายความปลอดภัยของสถานที่จัดงาน หากเกิดเหตุการณ์บัตรล้นหรือความไม่ปลอดภัย ผู้จัดงานต้องรับผิดชอบความเสียหายทั้งหมดแต่เพียงผู้เดียว',
      },
      {
        number: '4.3',
        title: 'ทรัพย์สินทางปัญญาและลิขสิทธิ์ (Intellectual Property)',
        content:
          'ผู้จัดงานขอรับรองว่ามีลิขสิทธิ์ สัญญาว่าจ้าง หรือสิทธิ์ในการใช้ภาพถ่าย โลโก้ ชื่อศิลปิน และสื่อประชาสัมพันธ์ทั้งหมดที่อัปโหลดเข้าสู่ระบบ หากมีการละเมิดลิขสิทธิ์ของบุคคลภายนอก ผู้จัดงานตกลงชดใช้ค่าเสียหายและปกป้องแพลตฟอร์ม TICKET จากข้อเรียกร้องใด ๆ ทั้งสิ้น',
      },
      {
        number: '4.4',
        title: 'การระงับสิทธิ์และการดำเนินคดี (Revocation & Legal Action)',
        content:
          'หากแพลตฟอร์มตรวจสอบพบว่าผู้จัดงานมีพฤติกรรมหลอกลวง ละเมิดข้อตกลงการให้บริการ หรือมีความเสี่ยงต่อความปลอดภัยของระบบและผู้ซื้อ แพลตฟอร์มมีสิทธิ์ระงับการขาย ปิดการเข้าถึงระบบ และระงับการโอนเงินทันที พร้อมทั้งดำเนินการทางกฎหมายทั้งทางแพ่งและทางอาญา',
      },
    ],
  },
];

export function OrganizerPoliciesView() {
  const [selectedCategory, setSelectedCategory] = useState<PolicyCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 300);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleExpandAll = () => {
    const all: Record<string, boolean> = {};
    for (const s of POLICY_SECTIONS) {
      all[s.id] = true;
    }
    setExpandedSections(all);
  };

  const handleCollapseAll = () => {
    setExpandedSections({});
  };

  const filteredSections = useMemo(() => {
    return POLICY_SECTIONS.filter((section) => {
      // 1. Filter by category
      if (selectedCategory !== 'all' && section.category !== selectedCategory) {
        return false;
      }

      // 2. Filter by search query
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      const inTitle = section.title.toLowerCase().includes(q);
      const inSubtitle = section.subtitle.toLowerCase().includes(q);
      const inTakeaways = section.keyTakeaways.some((t) => t.toLowerCase().includes(q));
      const inTerms = section.terms.some(
        (term) =>
          term.title.toLowerCase().includes(q) ||
          term.content.toLowerCase().includes(q) ||
          term.number.toLowerCase().includes(q),
      );

      return inTitle || inSubtitle || inTakeaways || inTerms;
    });
  }, [selectedCategory, searchQuery]);

  const categoryCounts = useMemo(() => {
    return {
      all: POLICY_SECTIONS.length,
      finance: POLICY_SECTIONS.filter((s) => s.category === 'finance').length,
      amendment: POLICY_SECTIONS.filter((s) => s.category === 'amendment').length,
      scanning: POLICY_SECTIONS.filter((s) => s.category === 'scanning').length,
      legal: POLICY_SECTIONS.filter((s) => s.category === 'legal').length,
    };
  }, []);

  const renderIcon = (type: PolicySection['icon']) => {
    switch (type) {
      case 'banknotes':
        return <BanknotesIcon width={24} height={24} />;
      case 'calendar':
        return <CalendarIcon width={24} height={24} />;
      case 'qrcode':
        return <QrCodeIcon width={24} height={24} />;
      case 'shield':
        return <ShieldCheckIcon width={24} height={24} />;
      default:
        return <ShieldCheckIcon width={24} height={24} />;
    }
  };

  return (
    <div className="policies-management-container" data-testid="organizer-policies-view">
      {/* 1. Header Toolbar (D-122: Clean Baseline) */}
      <header className="policies-management-header">
        <div className="policies-management-title-wrap">
          <h1 className="policies-management-title">ข้อตกลงและเงื่อนไขการให้บริการสำหรับผู้จัดงาน</h1>
          <p className="policies-management-desc">
            ข้อกำหนดความร่วมมือ มาตรการทางการเงิน กติกาการสแกน และความรับผิดชอบร่วมกันระหว่างผู้จัดงานและแพลตฟอร์ม TICKET
          </p>
        </div>
      </header>

      {/* 2. Category Tabs & Search Bar */}
      <div className="policies-filter-bar">
        <nav className="policies-category-tabs" aria-label="ตัวกรองหมวดหมู่ข้อตกลง">
          <button
            type="button"
            className={`policies-category-tab ${selectedCategory === 'all' ? 'is-active' : ''}`}
            onClick={() => setSelectedCategory('all')}
            data-testid="policy-tab-all"
          >
            <span>ทั้งหมด</span>
            <span className="policies-tab-count">{categoryCounts.all}</span>
          </button>
          <button
            type="button"
            className={`policies-category-tab ${selectedCategory === 'finance' ? 'is-active' : ''}`}
            onClick={() => setSelectedCategory('finance')}
            data-testid="policy-tab-finance"
          >
            <span>การเงินและค่าธรรมเนียม</span>
            <span className="policies-tab-count">{categoryCounts.finance}</span>
          </button>
          <button
            type="button"
            className={`policies-category-tab ${selectedCategory === 'amendment' ? 'is-active' : ''}`}
            onClick={() => setSelectedCategory('amendment')}
            data-testid="policy-tab-amendment"
          >
            <span>การแก้ไข/เลื่อน/ยกเลิก</span>
            <span className="policies-tab-count">{categoryCounts.amendment}</span>
          </button>
          <button
            type="button"
            className={`policies-category-tab ${selectedCategory === 'scanning' ? 'is-active' : ''}`}
            onClick={() => setSelectedCategory('scanning')}
            data-testid="policy-tab-scanning"
          >
            <span>การสแกนและควบคุมประตู</span>
            <span className="policies-tab-count">{categoryCounts.scanning}</span>
          </button>
          <button
            type="button"
            className={`policies-category-tab ${selectedCategory === 'legal' ? 'is-active' : ''}`}
            onClick={() => setSelectedCategory('legal')}
            data-testid="policy-tab-legal"
          >
            <span>ข้อมูลและความปลอดภัย</span>
            <span className="policies-tab-count">{categoryCounts.legal}</span>
          </button>
        </nav>

        <div className="policies-filter-actions">
          <div className="policies-search-wrap">
            <SearchIcon width={16} height={16} className="policies-search-icon" />
            <input
              type="text"
              className="policies-search-input"
              placeholder="ค้นหาข้อตกลง เช่น ค่าบริการ, คืนเงิน, โควตาสแกน, PDPA..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="ค้นหาข้อตกลงและเงื่อนไข"
              data-testid="policies-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="policies-search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label="ล้างคำค้นหา"
              >
                <XIcon width={14} height={14} />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            size="md"
            className="policies-print-btn"
            onClick={() => window.print()}
            data-testid="policies-print-btn"
            title="พิมพ์หรือบันทึกเป็นเอกสาร PDF"
            aria-label="พิมพ์หรือบันทึกเป็นเอกสาร PDF"
            icon={<PrinterIcon width={16} height={16} />}
          >
            พิมพ์ / บันทึก PDF ข้อตกลง
          </Button>
        </div>
      </div>

      {/* Quick Toolbar Actions (Expand/Collapse All) */}
      {filteredSections.length > 0 && (
        <div className="policies-toolbar-actions">
          <span className="policies-count-label">แสดงทั้งหมด {filteredSections.length} หมวดหมู่</span>
          <div className="policies-expand-controls">
            <button
              type="button"
              className="policy-action-pill-btn"
              onClick={handleExpandAll}
              data-testid="policies-expand-all-btn"
            >
              ขยายข้อกำหนดทั้งหมด
            </button>
            <span className="policies-actions-sep" aria-hidden="true">
              |
            </span>
            <button
              type="button"
              className="policy-action-pill-btn"
              onClick={handleCollapseAll}
              data-testid="policies-collapse-all-btn"
            >
              พับข้อกำหนดทั้งหมด
            </button>
          </div>
        </div>
      )}

      {/* 3. Policy Sections List */}
      <div className="policies-sections-list">
        {filteredSections.length > 0 ? (
          filteredSections.map((section) => {
            const isExpanded = Boolean(expandedSections[section.id]);
            return (
              <article
                key={section.id}
                className="policy-editorial-card"
                data-testid={`policy-card-${section.id}`}
              >
                {/* Card Header */}
                <div className="policy-card-header">
                  <div className="policy-card-icon-wrap" aria-hidden="true">
                    {renderIcon(section.icon)}
                  </div>
                  <div className="policy-card-title-block">
                    <div className="policy-card-meta-line">
                      <Badge variant="brand" size="sm" className="policy-card-badge">
                        {section.badge}
                      </Badge>
                    </div>
                    <h2 className="policy-card-title">{section.title}</h2>
                    <p className="policy-card-subtitle">{section.subtitle}</p>
                  </div>
                </div>

                {/* Key Takeaways Box (Always visible in collapsed & expanded state) */}
                <div className="policy-takeaways-box">
                  <div className="policy-takeaways-header">
                    <CheckCircleIcon width={18} height={18} className="policy-takeaways-icon" />
                    <h3 className="policy-takeaways-title">สรุปสาระสำคัญ (Key Takeaways)</h3>
                  </div>
                  <ul className="policy-takeaways-list">
                    {section.keyTakeaways.map((takeaway) => (
                      <li key={takeaway.slice(0, 30)} className="policy-takeaway-item">
                        <span className="policy-takeaway-bullet" aria-hidden="true">
                          •
                        </span>
                        <span>{takeaway}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Card Bottom Bar: Toggle Full Terms Button */}
                <div className="policy-card-bottom-bar">
                  <button
                    type="button"
                    className="policy-toggle-terms-btn"
                    onClick={() => toggleSection(section.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`policy-terms-${section.id}`}
                    data-testid={`policy-toggle-${section.id}`}
                  >
                    <span>
                      {isExpanded
                        ? 'พับเก็บข้อกำหนดและเงื่อนไขฉบับเต็ม'
                        : `ดูข้อกำหนดและเงื่อนไขฉบับเต็ม (${section.terms.length} ข้อ)`}
                    </span>
                    {isExpanded ? (
                      <ChevronUpIcon width={16} height={16} />
                    ) : (
                      <ChevronDownIcon width={16} height={16} />
                    )}
                  </button>
                </div>

                {/* Full Terms Section (Collapsible via CSS & Always Expanded on Print) */}
                <div
                  id={`policy-terms-${section.id}`}
                  className={`policy-terms-block ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}
                  data-testid={`policy-terms-${section.id}`}
                >
                  <h3 className="policy-terms-heading">ข้อกำหนดและเงื่อนไขฉบับเต็ม</h3>
                  <div className="policy-terms-grid">
                    {section.terms.map((term) => (
                      <div key={term.number} className="policy-term-item">
                        <div className="policy-term-head">
                          <span className="policy-term-num">{term.number}</span>
                          <h4 className="policy-term-title">{term.title}</h4>
                        </div>
                        <p className="policy-term-body">{term.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="policy-empty-state" data-testid="policy-empty-state">
            <ShieldCheckIcon width={40} height={40} className="policy-empty-icon" />
            <h3 className="policy-empty-title">ไม่พบข้อตกลงที่ตรงกับคำค้นหา</h3>
            <p className="policy-empty-desc">
              ลองเปลี่ยนคำค้นหา หรือเลือกดูหมวดหมู่อื่นเพื่อค้นหาข้อกำหนดและเงื่อนไขที่ต้องการ
            </p>
            {searchQuery && (
              <button
                type="button"
                className="policy-empty-clear-btn"
                onClick={() => setSearchQuery('')}
              >
                ล้างคำค้นหา
              </button>
            )}
          </div>
        )}
      </div>

      {/* Floating Back-to-Top Button */}
      {showScrollTop && (
        <button
          type="button"
          className="floating-back-to-top"
          onClick={handleScrollToTop}
          title="กลับสู่ด้านบนสุด"
          aria-label="กลับสู่ด้านบนสุด"
          data-testid="policies-back-to-top-btn"
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
