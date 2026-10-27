'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  CalendarIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  XMarkIcon,
  ClockIcon,
} from '@/components/icons';
import { TicketIcon } from '@/components/ticket-icon';

export interface OrganizerNewsItem {
  id: string;
  title: string;
  content: string;
  summary: string;
  category: string;
  relatedConcert?: string;
  status: 'draft' | 'pending' | 'published' | 'rejected';
  coverUrl?: string;
  rejectionReason?: string;
  updatedAt: string;
  createdAt: string;
}

const INITIAL_NEWS: OrganizerNewsItem[] = [
  {
    id: 'news-1',
    title: 'เปิดจำหน่ายบัตร Neon Nights World Tour in Bangkok 2026 อย่างเป็นทางการ',
    summary:
      'เตรียมพบกับปรากฏการณ์ดนตรีระดับโลก จัดเต็มแสง สี เสียง 2 รอบการแสดง ณ อิมแพ็ค อารีน่า เมืองทองธานี พร้อมเปิดระบบจองบัตร 1 พ.ย. นี้',
    content: `เตรียมตัวให้พร้อมกับคอนเสิร์ตครั้งยิ่งใหญ่แห่งปี "Neon Nights World Tour in Bangkok 2026" ที่จะพาทุกท่านเดินทางสู่ค่ำคืนแห่งเสียงดนตรีและแสงสีสุดตระการตา

การแสดงจะมีขึ้นทั้งหมด 2 รอบการแสดง:
- รอบที่ 1: วันเสาร์ที่ 15 พฤศจิกายน 2569 เวลา 19:00 น.
- รอบที่ 2: วันอาทิตย์ที่ 16 พฤศจิกายน 2569 เวลา 18:00 น.

สถานที่: อิมแพ็ค อารีน่า เมืองทองธานี
เปิดจำหน่ายบัตรอย่างเป็นทางการ: วันศุกร์ที่ 1 พฤศจิกายน 2569 เวลา 10:00 น. ตรงผ่านแพลตฟอร์ม TICKET ผู้ชมสามารถเลือกซื้อบัตรได้โดยไม่ต้องสมัครสมาชิก กรุณาเตรียมอีเมลสำหรับรับรหัส OTP และแอปธนาคารสำหรับชำระเงินผ่าน PromptPay QR`,
    category: 'ประชาสัมพันธ์คอนเสิร์ต',
    relatedConcert: 'Neon Nights World Tour in Bangkok 2026',
    status: 'published',
    coverUrl: '/banners/neon-nights.svg',
    updatedAt: '26 ต.ค. 2569 : 14:30 น.',
    createdAt: '25 ต.ค. 2569 : 09:00 น.',
  },
  {
    id: 'news-2',
    title: 'ประกาศผังที่นั่ง จุดบริการรถรับ-ส่ง Shuttle Bus และการเดินทางคอนเสิร์ต Neon Nights',
    summary:
      'อำนวยความสะดวกแก่ผู้ชมทุกท่านด้วยบริการ Shuttle Bus ฟรี จากสถานีรถไฟฟ้า MRT และข้อมูลจุดตรวจบัตรเข้างาน Fast Track',
    content: `เพื่อให้การเดินทางเข้าชมคอนเสิร์ต "Neon Nights World Tour in Bangkok 2026" เป็นไปด้วยความสะดวกและราบรื่น ทางผู้จัดงานได้เตรียมจุดบริการ Shuttle Bus รับ-ส่ง ฟรี สำหรับผู้ถือบัตรคอนเสิร์ตทุกประเภท

จุดจอดรับ-ส่ง:
1. สถานี MRT สายสีชมพู (สถานีศรีรัช ทางออก 3)
2. อาคารจอดรถ Cosmo Bazaar เมืองทองธานี

รอบการเดินรถ:
- ขาไป: เริ่มตั้งแต่เวลา 14:00 น. จนถึงเวลาเริ่มการแสดง (รถออกทุก ๆ 15 นาที)
- ขากลับ: เริ่มให้บริการทันทีหลังจบการแสดง จนถึง 23:30 น.

โปรดแสดงบัตรดิจิทัลบนโทรศัพท์มือถือต่อเจ้าหน้าที่ก่อนขึ้นรถ`,
    category: 'ประกาศสำคัญ',
    relatedConcert: 'Neon Nights World Tour in Bangkok 2026',
    status: 'pending',
    coverUrl: '',
    updatedAt: '27 ต.ค. 2569 : 18:15 น.',
    createdAt: '27 ต.ค. 2569 : 15:00 น.',
  },
  {
    id: 'news-3',
    title: 'เตรียมพบกับ Summer Sound Festival 2027 การรวมตัวของไลน์อัปศิลปินชั้นนำทั่วเอเชีย',
    summary:
      'เปิดมิติใหม่ของเทศกาลดนตรีกลางแจ้งริมชายหาด 3 วัน 3 คืน พร้อมสิทธิพิเศษสำหรับผู้ซื้อบัตรรอบ Early Bird เร็ว ๆ นี้',
    content: `เทศกาลดนตรีฤดูร้อนที่ทุกคนรอคอย "Summer Sound Festival 2027" เตรียมกลับมาสร้างความประทับใจอีกครั้ง พร้อมเวทีริมชายหาดขนาดใหญ่ 3 เวที และไลน์อัปศิลปินอินดี้และป็อปมากกว่า 40 วงทั่วเอเชีย

รายละเอียดและกำหนดการเปิดจองบัตรจะประกาศให้ทราบอย่างเป็นทางการในเร็ว ๆ นี้ โปรดติดตามข่าวสารผ่านหน้าเว็บไซต์`,
    category: 'กิจกรรมและสิทธิพิเศษ',
    relatedConcert: 'Summer Sound Festival 2027',
    status: 'draft',
    coverUrl: '',
    updatedAt: '28 ต.ค. 2569 : 01:20 น.',
    createdAt: '28 ต.ค. 2569 : 01:20 น.',
  },
  {
    id: 'news-4',
    title: 'สิทธิพิเศษส่วนลด Early Bird 10% สำหรับแฟนคลับ VIP ผ่านโค้ดส่วนลดพิเศษ',
    summary:
      'มอบส่วนลดพิเศษ 10% ให้แก่ผู้ซื้อบัตรโซน VIP เมื่อทำรายการสั่งซื้อภายใน 2 ชั่วโมงแรกของการเปิดจำหน่าย',
    content: `สิทธิพิเศษเฉพาะแฟนคลับ VIP มอบส่วนลด 10% สำหรับการสั่งซื้อบัตรประเภท VIP Zone ในรอบวันเสาร์ที่ 15 พฤศจิกายน 2569

เงื่อนไขการรับสิทธิ์:
- ใช้สิทธิ์ได้เฉพาะคำสั่งซื้อที่มีบัตร VIP อย่างน้อย 1 ใบ
- ส่วนลดจะถูกคำนวณและหักลดในหน้าสรุปยอดชำระเงินก่อนยืนยัน PromptPay QR`,
    category: 'กิจกรรมและสิทธิพิเศษ',
    relatedConcert: 'Neon Nights World Tour in Bangkok 2026',
    status: 'rejected',
    rejectionReason:
      'กรุณาระบุรายละเอียดโค้ดส่วนลด เงื่อนไขโควตาสูงสุดต่อออเดอร์ และช่วงเวลาเริ่ม-สิ้นสุดของโปรโมชันให้ครบถ้วนชัดเจน เพื่อให้ระบบกันบัตร 15 นาทีสามารถคำนวณราคาได้อย่างถูกต้อง',
    updatedAt: '25 ต.ค. 2569 : 16:40 น.',
    createdAt: '25 ต.ค. 2569 : 11:30 น.',
  },
];

const CATEGORIES = [
  'ประชาสัมพันธ์คอนเสิร์ต',
  'ประกาศสำคัญ',
  'กิจกรรมและสิทธิพิเศษ',
  'อัปเดตและแจ้งเตือน',
];

const CONCERTS = [
  'Neon Nights World Tour in Bangkok 2026',
  'Summer Sound Festival 2027',
  'ไม่ระบุคอนเสิร์ตเฉพาะ',
];

const STATUS_LABELS: Record<OrganizerNewsItem['status'], { label: string; class: string }> = {
  draft: { label: 'ฉบับร่าง', class: 'status-draft' },
  pending: { label: 'รอเจ้าของอนุมัติ', class: 'status-pending' },
  published: { label: 'เผยแพร่แล้ว', class: 'status-published' },
  rejected: { label: 'ส่งกลับแก้ไข', class: 'status-rejected' },
};

export function OrganizerNewsView() {
  const [newsList, setNewsList] = useState<OrganizerNewsItem[]>(INITIAL_NEWS);
  const [activeTab, setActiveTab] = useState<
    'all' | 'draft' | 'pending' | 'published' | 'rejected'
  >('all');

  // Modal States
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<OrganizerNewsItem | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState(CATEGORIES[0]);
  const [formConcert, setFormConcert] = useState(CONCERTS[0]);
  const [formContent, setFormContent] = useState('');
  const [formCoverPreview, setFormCoverPreview] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [showScrollTop, setShowScrollTop] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 300);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle escape key to close modals
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (previewItem) {
          setPreviewItem(null);
        } else if (isEditorOpen) {
          setIsEditorOpen(false);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditorOpen, previewItem]);

  // Filtered List
  const filteredNews = newsList.filter((item) => {
    if (activeTab === 'all') return true;
    return item.status === activeTab;
  });

  const countByStatus = {
    all: newsList.length,
    draft: newsList.filter((n) => n.status === 'draft').length,
    pending: newsList.filter((n) => n.status === 'pending').length,
    published: newsList.filter((n) => n.status === 'published').length,
    rejected: newsList.filter((n) => n.status === 'rejected').length,
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleStartCreate = () => {
    setEditingId(null);
    setFormTitle('');
    setFormCategory(CATEGORIES[0]);
    setFormConcert(CONCERTS[0]);
    setFormContent('');
    setFormCoverPreview(null);
    setFormError(null);
    setEditorMode('create');
    setIsEditorOpen(true);
  };

  const handleStartEdit = (item: OrganizerNewsItem) => {
    setEditingId(item.id);
    setFormTitle(item.title);
    setFormCategory(item.category);
    setFormConcert(item.relatedConcert || CONCERTS[0]);
    setFormContent(item.content);
    setFormCoverPreview(item.coverUrl || null);
    setFormError(null);
    setEditorMode('edit');
    setIsEditorOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      setFormError('รองรับเฉพาะไฟล์รูปภาพ PNG, JPG, JPEG เท่านั้น');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('ขนาดไฟล์ต้องไม่เกิน 5MB');
      return;
    }

    setFormError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      setFormCoverPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setFormCoverPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = (targetStatus: 'draft' | 'pending') => {
    if (!formTitle.trim()) {
      setFormError('กรุณากรอกหัวข้อข่าวสาร');
      return;
    }
    if (!formContent.trim()) {
      setFormError('กรุณากรอกเนื้อหาข่าวสาร');
      return;
    }

    const nowStr = '28 ต.ค. 2569 : 02:20 น.';
    const snippet =
      formContent.trim().length > 120
        ? `${formContent.trim().substring(0, 120)}...`
        : formContent.trim();

    if (editorMode === 'create') {
      const newItem: OrganizerNewsItem = {
        id: `news-${Date.now()}`,
        title: formTitle.trim(),
        category: formCategory,
        relatedConcert: formConcert === 'ไม่ระบุคอนเสิร์ตเฉพาะ' ? undefined : formConcert,
        content: formContent.trim(),
        summary: snippet,
        status: targetStatus,
        coverUrl: formCoverPreview || undefined,
        createdAt: nowStr,
        updatedAt: nowStr,
      };
      setNewsList((prev) => [newItem, ...prev]);
      showToast(
        targetStatus === 'pending'
          ? 'ส่งข่าวสารไปยังเจ้าของระบบเพื่อขออนุมัติเรียบร้อยแล้ว'
          : 'บันทึกข่าวสารเป็นฉบับร่างเรียบร้อยแล้ว',
      );
    } else if (editorMode === 'edit' && editingId) {
      setNewsList((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? {
                ...item,
                title: formTitle.trim(),
                category: formCategory,
                relatedConcert:
                  formConcert === 'ไม่ระบุคอนเสิร์ตเฉพาะ' ? undefined : formConcert,
                content: formContent.trim(),
                summary: snippet,
                status: targetStatus,
                coverUrl: formCoverPreview || undefined,
                rejectionReason:
                  targetStatus === 'pending' ? undefined : item.rejectionReason,
                updatedAt: nowStr,
              }
            : item,
        ),
      );
      showToast(
        targetStatus === 'pending'
          ? 'ส่งข่าวสารที่แก้ไขไปยังเจ้าของระบบเพื่อขออนุมัติเรียบร้อยแล้ว'
          : 'บันทึกการแก้ไขฉบับร่างเรียบร้อยแล้ว',
      );
    }

    setIsEditorOpen(false);
  };

  const handleSubmitForApproval = (id: string) => {
    const nowStr = '28 ต.ค. 2569 : 02:20 น.';
    setNewsList((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'pending',
              rejectionReason: undefined,
              updatedAt: nowStr,
            }
          : item,
      ),
    );
    showToast('ส่งคำขออนุมัติไปยังเจ้าของระบบเรียบร้อยแล้ว');
  };

  const handleDelete = (id: string) => {
    if (confirm('คุณต้องการลบข่าวสารนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
      setNewsList((prev) => prev.filter((item) => item.id !== id));
      if (previewItem?.id === id) {
        setPreviewItem(null);
      }
      showToast('ลบข่าวสารเรียบร้อยแล้ว');
    }
  };

  const handleOpenPreviewCurrentForm = () => {
    if (!formTitle.trim()) {
      setFormError('กรุณากรอกหัวข้อข่าวสารก่อนเปิดดูตัวอย่าง');
      return;
    }
    const tempItem: OrganizerNewsItem = {
      id: editingId || 'temp-preview',
      title: formTitle.trim(),
      category: formCategory,
      relatedConcert: formConcert === 'ไม่ระบุคอนเสิร์ตเฉพาะ' ? undefined : formConcert,
      content: formContent.trim() || 'ยังไม่มีเนื้อหาข่าวสารในขณะนี้',
      summary: formContent.trim().substring(0, 100),
      status: 'draft',
      coverUrl: formCoverPreview || undefined,
      createdAt: 'วันนี้',
      updatedAt: 'วันนี้',
    };
    setPreviewItem(tempItem);
  };

  return (
    <div className="organizer-news-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="organizer-news-toast" role="status">
          <CheckCircleIcon width={18} height={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* MAIN VIEW: LIST (Always retained as base view) */}
      <div className="news-management-container">
        {/* Header Toolbar */}
        <header className="news-management-header">
          <div className="news-management-title-wrap">
            <h1 className="news-management-title">จัดการข่าวสารและประกาศ</h1>
            <p className="news-management-desc">
              เขียน แก้ไข และส่งคำขอประชาสัมพันธ์คอนเสิร์ต
              เพื่อให้เจ้าของระบบตรวจสอบและอนุมัติก่อนเผยแพร่สู่สาธารณะ
            </p>
          </div>
          <button
            type="button"
            className="news-create-btn"
            onClick={handleStartCreate}
          >
            <PencilSquareIcon width={16} height={16} />
            <span>+ เขียนข่าวสารใหม่</span>
          </button>
        </header>

        {/* Status Filter Tabs */}
        <nav className="news-status-tabs" aria-label="ตัวกรองสถานะข่าวสาร">
          <button
            type="button"
            className={`news-status-tab ${activeTab === 'all' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <span>ทั้งหมด</span>
            <span className="news-tab-count">{countByStatus.all}</span>
          </button>
          <button
            type="button"
            className={`news-status-tab ${activeTab === 'draft' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('draft')}
          >
            <span>ฉบับร่าง</span>
            <span className="news-tab-count">{countByStatus.draft}</span>
          </button>
          <button
            type="button"
            className={`news-status-tab ${activeTab === 'pending' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            <span>รออนุมัติ</span>
            <span className="news-tab-count">{countByStatus.pending}</span>
          </button>
          <button
            type="button"
            className={`news-status-tab ${activeTab === 'published' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('published')}
          >
            <span>เผยแพร่แล้ว</span>
            <span className="news-tab-count">{countByStatus.published}</span>
          </button>
          <button
            type="button"
            className={`news-status-tab ${activeTab === 'rejected' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('rejected')}
          >
            <span>ส่งกลับแก้ไข</span>
            <span className="news-tab-count">{countByStatus.rejected}</span>
          </button>
        </nav>

        {/* News Items List (แบบ A - Horizontal Editorial Cards) */}
        <div className="news-cards-list">
          {filteredNews.length === 0 ? (
            <div className="news-empty-box">
              <div className="news-empty-icon-wrap">
                <CalendarIcon width={36} height={36} />
              </div>
              <h2 className="news-empty-title">ไม่พบรายการข่าวสารในหมวดหมู่นี้</h2>
              <p className="news-empty-desc">
                คุณสามารถคลิกปุ่ม &quot;+ เขียนข่าวสารใหม่&quot; ด้านบนเพื่อเริ่มเขียนบทความ
              </p>
              <button
                type="button"
                className="news-create-btn"
                onClick={handleStartCreate}
              >
                <PencilSquareIcon width={16} height={16} />
                <span>เขียนข่าวสารใหม่</span>
              </button>
            </div>
          ) : (
            filteredNews.map((item) => (
              <article key={item.id} className="news-editorial-card">
                {/* Details & Metadata (Clean No-Thumbnail Layout per D-84) */}
                <div className="news-card-body">
                  <div className="news-card-badges-row">
                    <span className={`news-status-badge ${STATUS_LABELS[item.status].class}`}>
                      {STATUS_LABELS[item.status].label}
                    </span>
                    <span className="news-category-badge">{item.category}</span>
                    {item.relatedConcert && (
                      <span className="news-concert-badge">
                        {item.relatedConcert}
                      </span>
                    )}
                    <span className="news-card-timestamp">
                      <ClockIcon width={13} height={13} />
                      <span>{item.updatedAt}</span>
                    </span>
                  </div>

                  <h2 className="news-card-title">{item.title}</h2>
                  <p className="news-card-summary">{item.summary}</p>

                  {/* Rejection Notice Banner if Rejected */}
                  {item.status === 'rejected' && item.rejectionReason && (
                    <div className="news-rejection-alert">
                      <AlertTriangleIcon width={16} height={16} />
                      <div className="rejection-alert-text">
                        <strong>เหตุผลที่ส่งกลับแก้ไขจากเจ้าของระบบ:</strong>
                        <p>{item.rejectionReason}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Actions Toolbar */}
                <div className="news-card-actions-col">
                  <button
                    type="button"
                    className="news-action-btn btn-preview"
                    onClick={() => setPreviewItem(item)}
                    title="เปิดดูตัวอย่างหน้าข่าวจริง"
                  >
                    <EyeIcon width={15} height={15} />
                    <span>ดูตัวอย่าง</span>
                  </button>

                  <button
                    type="button"
                    className="news-action-btn btn-edit"
                    onClick={() => handleStartEdit(item)}
                    title="แก้ไขเนื้อหาข่าว"
                  >
                    <PencilSquareIcon width={15} height={15} />
                    <span>แก้ไข</span>
                  </button>

                  {(item.status === 'draft' || item.status === 'rejected') && (
                    <button
                      type="button"
                      className="news-action-btn btn-submit"
                      onClick={() => handleSubmitForApproval(item.id)}
                      title="ส่งคำขอให้เจ้าของระบบอนุมัติ"
                    >
                      <CheckCircleIcon width={15} height={15} />
                      <span>ส่งขออนุมัติ</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="news-action-btn btn-delete"
                    onClick={() => handleDelete(item.id)}
                    title="ลบข่าวสารนี้"
                  >
                    <TrashIcon width={15} height={15} />
                    <span>ลบ</span>
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      {/* EDITOR MODAL POPUP (แบบ 2 - หน้าต่างป๊อปอัปเขียน/แก้ไขข่าวสาร) */}
      {isEditorOpen && (
        <div
          className="news-editor-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="editor-modal-title"
        >
          <button
            type="button"
            className="editor-modal-backdrop-btn"
            onClick={() => setIsEditorOpen(false)}
            aria-label="ปิดหน้าต่างเขียนข่าว"
            tabIndex={-1}
          />
          <div className="news-editor-modal-card">
            {/* Modal Header */}
            <div className="editor-modal-header">
              <div className="editor-modal-title-wrap">
                <h2 id="editor-modal-title" className="editor-modal-title">
                  {editorMode === 'create' ? 'เขียนข่าวสารและประกาศใหม่' : 'แก้ไขข่าวสาร'}
                </h2>
                <p className="editor-modal-subtitle">
                  กรอกรายละเอียดข่าวสาร บันทึกเป็นฉบับร่าง หรือส่งให้เจ้าของระบบตรวจสอบเพื่ออนุมัติเผยแพร่
                </p>
              </div>
              <button
                type="button"
                className="editor-modal-close-btn"
                onClick={() => setIsEditorOpen(false)}
                aria-label="ปิดหน้าต่าง"
                title="ปิด"
              >
                <XMarkIcon width={18} height={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="editor-modal-body">
              {formError && (
                <div className="news-form-error-banner" role="alert">
                  <AlertTriangleIcon width={18} height={18} />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Cover Image Dropzone (16:9) */}
              <div className="form-group-block">
                <label className="news-form-card-label" htmlFor="modal-cover-image-input">
                  ภาพหน้าปกข่าวสาร (สัดส่วน 16:9 แนวนอน)
                </label>
                <p className="form-field-helper">
                  ภาพปกจะแสดงที่ด้านบนของบทความข่าวและในการ์ดประชาสัมพันธ์บนหน้าแรก
                </p>

                <input
                  id="modal-cover-image-input"
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/png, image/jpeg, image/jpg"
                  className="sr-only"
                />

                {formCoverPreview ? (
                  <div className="cover-preview-box">
                    {/* Layer 1: Blurred background fill for non-16:9 or edge bleeding */}
                    <Image
                      src={formCoverPreview}
                      alt=""
                      fill
                      unoptimized
                      className="cover-preview-blur-bg"
                      aria-hidden="true"
                    />
                    {/* Layer 2: Main crisp uncropped image centered */}
                    <Image
                      src={formCoverPreview}
                      alt="ตัวอย่างภาพหน้าปกข่าว"
                      fill
                      unoptimized
                      className="cover-preview-main-img"
                    />
                    <div className="cover-preview-aspect-pill">
                      <span>สัดส่วน 16:9 (พร้อมระบบเติมขอบเบลออัจฉริยะ)</span>
                    </div>
                    <div className="cover-preview-controls">
                      <button
                        type="button"
                        className="cover-control-btn btn-change"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        เปลี่ยนภาพปก
                      </button>
                      <button
                        type="button"
                        className="cover-control-btn btn-remove"
                        onClick={handleRemoveImage}
                      >
                        ลบภาพ
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="cover-dropzone-box"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="อัปโหลดภาพหน้าปกข่าวสาร สัดส่วน 16:9"
                  >
                    <div className="dropzone-ratio-indicator">
                      <span>สัดส่วน 16:9 แนวนอน</span>
                    </div>
                    <div className="dropzone-icon-wrap">
                      <CalendarIcon width={32} height={32} />
                    </div>
                    <span className="dropzone-text-bold">
                      คลิกเพื่ออัปโหลดภาพหน้าปก หรือลากไฟล์มาวางที่นี่
                    </span>
                    <span className="dropzone-text-sub">
                      จำลองขนาด 16:9 พอดีช่อง หากภาพไม่ได้สัดส่วน ระบบจะสร้างพื้นหลังเบลอ (Blurred Backdrop) ให้อัตโนมัติ
                    </span>
                    <span className="dropzone-text-specs">
                      รองรับไฟล์ PNG, JPG, JPEG ขนาดไม่เกิน 5MB
                    </span>
                  </button>
                )}
              </div>

              {/* 2. Title Input */}
              <div className="form-group-block">
                <label className="news-form-card-label" htmlFor="modal-news-title-input">
                  หัวข้อข่าวสาร / พาดหัวข่าว <span className="text-red-500">*</span>
                </label>
                <input
                  id="modal-news-title-input"
                  type="text"
                  className="form-input-text"
                  placeholder="เช่น เปิดจำหน่ายบัตรคอนเสิร์ต Neon Nights 2026 อย่างเป็นทางการ"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>

              {/* 3. Category & Related Concert */}
              <div className="form-row-two-col">
                <div className="form-group-block">
                  <label className="news-form-card-label" htmlFor="modal-news-category-select">
                    หมวดหมู่ข่าวสาร <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="modal-news-category-select"
                    className="form-select-control"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group-block">
                  <label className="news-form-card-label" htmlFor="modal-news-concert-select">
                    คอนเสิร์ตที่เกี่ยวข้อง
                  </label>
                  <select
                    id="modal-news-concert-select"
                    className="form-select-control"
                    value={formConcert}
                    onChange={(e) => setFormConcert(e.target.value)}
                  >
                    {CONCERTS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4. Content Editor */}
              <div className="form-group-block">
                <label className="news-form-card-label" htmlFor="modal-news-content-textarea">
                  เนื้อหาข่าวสารฉบับเต็ม <span className="text-red-500">*</span>
                </label>
                <p className="form-field-helper">
                  สามารถแบ่งย่อหน้า ใส่รายละเอียดรอบการแสดง สถานที่ และข้อแนะนำต่าง ๆ ได้อย่างอิสระ
                </p>
                <textarea
                  id="modal-news-content-textarea"
                  rows={9}
                  className="form-textarea-control"
                  placeholder="พิมพ์เนื้อหาข่าวสาร รายละเอียดของงานคอนเสิร์ต และข้อมูลที่ต้องการแจ้งให้ผู้ชมทราบ..."
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                />
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="editor-modal-footer">
              <div className="editor-footer-left">
                <button
                  type="button"
                  className="btn-form-preview"
                  onClick={handleOpenPreviewCurrentForm}
                >
                  <EyeIcon width={16} height={16} />
                  <span>ดูตัวอย่าง (Preview)</span>
                </button>
              </div>

              <div className="editor-footer-right">
                <button
                  type="button"
                  className="btn-form-cancel"
                  onClick={() => setIsEditorOpen(false)}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="btn-form-draft"
                  onClick={() => handleSave('draft')}
                >
                  บันทึกฉบับร่าง
                </button>
                <button
                  type="button"
                  className="btn-form-submit"
                  onClick={() => handleSave('pending')}
                >
                  <CheckCircleIcon width={16} height={16} />
                  <span>ส่งให้เจ้าของอนุมัติ</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIVE PREVIEW MODAL */}
      {previewItem && (
        <div
          className="news-preview-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-modal-title"
        >
          <button
            type="button"
            className="preview-modal-backdrop-btn"
            onClick={() => setPreviewItem(null)}
            aria-label="ปิดหน้าต่างดูตัวอย่าง"
            tabIndex={-1}
          />
          <div className="news-preview-modal-card">
            {/* Modal Header */}
            <div className="preview-modal-header">
              <div className="preview-modal-header-meta">
                <span className="preview-tag-indicator">ตัวอย่างหน้าข่าวสารจริง</span>
                <span className={`news-status-badge ${STATUS_LABELS[previewItem.status].class}`}>
                  {STATUS_LABELS[previewItem.status].label}
                </span>
              </div>
              <button
                type="button"
                className="preview-modal-close-btn"
                onClick={() => setPreviewItem(null)}
                aria-label="ปิดหน้าต่าง"
                title="ปิด"
              >
                <XMarkIcon width={18} height={18} />
              </button>
            </div>

            {/* Article Container mimicking /news/[id] */}
            <div className="preview-modal-body">
              {/* Cover Banner with Blurred Backdrop */}
              {previewItem.coverUrl ? (
                <div className="preview-article-cover-wrap">
                  {/* Layer 1: Blurred background fill */}
                  <Image
                    src={previewItem.coverUrl}
                    alt=""
                    fill
                    unoptimized
                    className="preview-article-blur-bg"
                    aria-hidden="true"
                  />
                  {/* Layer 2: Crisp centered uncropped image */}
                  <Image
                    src={previewItem.coverUrl}
                    alt={previewItem.title}
                    fill
                    unoptimized
                    className="preview-article-main-img"
                  />
                </div>
              ) : (
                <div className="preview-article-cover-placeholder">
                  <div className="placeholder-logo-lockup large">
                    <TicketIcon
                      className="placeholder-logo-icon"
                      style={{ width: '56px', height: '56px' }}
                    />
                    <span className="placeholder-logo-text">TICKET</span>
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="preview-article-meta-row">
                <span className="news-category-badge">{previewItem.category}</span>
                {previewItem.relatedConcert && (
                  <span className="news-concert-badge">{previewItem.relatedConcert}</span>
                )}
                <span className="preview-meta-date">
                  <CalendarIcon width={14} height={14} />
                  <span>{previewItem.updatedAt}</span>
                </span>
                <span className="preview-meta-author">เขียนโดย: ผู้จัดงาน</span>
              </div>

              {/* Title */}
              <h1 id="preview-modal-title" className="preview-article-title">
                {previewItem.title}
              </h1>

              {/* Article Content */}
              <div className="preview-article-content">
                {previewItem.content.split('\n\n').map((paragraph, index) => (
                  <p key={String(index)}>{paragraph}</p>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="preview-modal-footer">
              <span className="preview-footer-note">
                นี่คือหน้าตาที่ผู้ชมจะเห็นบนหน้าข่าวสารหลักเมื่อบทความได้รับการอนุมัติ
              </span>
              <button
                type="button"
                className="preview-modal-footer-close-btn"
                onClick={() => setPreviewItem(null)}
              >
                ปิดหน้าต่างดูตัวอย่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Back to Top Button */}
      {showScrollTop && (
        <button
          type="button"
          className="settings-floating-top-btn"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="เลื่อนขึ้นบนสุด"
          title="เลื่อนขึ้นบนสุด"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}
    </div>
  );
}
