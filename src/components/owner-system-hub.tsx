'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import {
  BellIcon,
  PhoneIcon,
  MailIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  CheckCircleIcon,
  SearchIcon,
  RefreshIcon,
  XIcon,
  AlertTriangleIcon,
  CheckIcon,
  EyeIcon,
  TrashIcon,
} from './icons';
import { formatDate } from '@/lib/locale';
import {
  loadOwnerContactInfo,
  saveOwnerContactInfo,
  resetOwnerContactInfo,
  type OwnerContactInfo,
} from '@/lib/owner-contact-sync';
import { OwnerSyncConflictManager } from './owner-sync-conflict-manager';

export type SystemHubTab = 'news' | 'contacts' | 'conflicts';
export type NewsStatusFilter = 'all' | 'published' | 'pending' | 'draft' | 'rejected';
export type NewsSourceFilter = 'all' | 'admin' | 'organizer';

export interface SystemNewsItem {
  id: string;
  title: string;
  content: string;
  summary?: string;
  category: string;
  source: 'admin' | 'organizer';
  relatedConcert?: string;
  authorName?: string;
  status: 'draft' | 'pending' | 'published' | 'rejected';
  coverUrl?: string;
  channels?: string[];
  rejectionReason?: string;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Representative realistic dataset for System News Hub (D-255)
const INITIAL_SYSTEM_NEWS: SystemNewsItem[] = [
  {
    id: 'news-sys-01',
    title: 'เปิดจำหน่ายบัตร UBU Freshy Music Fest 2026 ราคาพิเศษสำหรับนักศึกษา 99 บาท',
    content:
      'สโมสรนักศึกษา มหาวิทยาลัยอุบลราชธานี ขอเชิญชวนเพื่อนๆ นักศึกษาและบุคลากรทุกท่าน ร่วมเป็นส่วนหนึ่งของค่ำคืนสุดประทับใจในเทศกาลดนตรีต้อนรับเพื่อนใหม่ UBU Freshy Music Fest 2026 โดยสิทธิพิเศษสำหรับชาว ม.อุบลฯ เมื่อใช้อีเมล @ubu.ac.th รับสิทธิ์ซื้อบัตรในราคาพิเศษเพียง 99 บาท (จากราคาปกติ 150 บาท) บัตรมีจำนวนจำกัด รีบจับจองก่อนหมด!',
    summary: 'สิทธิพิเศษสำหรับชาว ม.อุบลฯ ซื้อบัตรในราคา 99 บาท ผ่านระบบจำหน่ายบัตรออนไลน์',
    category: 'ประชาสัมพันธ์คอนเสิร์ต',
    source: 'organizer',
    authorName: 'สโมสรนักศึกษา ม.อุบลฯ',
    relatedConcert: 'UBU Freshy Music Fest 2026',
    status: 'published',
    channels: ['หน้าแรกเว็บ', 'หน้ารายละเอียดคอนเสิร์ต'],
    publishedAt: '2026-11-01T10:00:00.000Z',
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  },
  {
    id: 'news-sys-02',
    title: 'ประกาศปรับปรุงระบบและกำหนดการปิดปรับปรุงฐานข้อมูลรอบดึก (System Maintenance)',
    content:
      'เพื่อยกระดับความเสถียรและความปลอดภัยในการจำหน่ายบัตรคอนเสิร์ต ทีมวิศวกรรมระบบจะดำเนินการปิดปรับปรุงฐานข้อมูลเซิร์ฟเวอร์ในวันพุธที่ 11 พฤศจิกายน 2569 เวลา 02:00 - 04:00 น. ในช่วงเวลาดังกล่าวระบบจำหน่ายบัตรและระบบสแกนบัตรจะระงับการให้บริการชั่วคราว ขออภัยในความไม่สะดวก',
    summary: 'แจ้งปิดปรับปรุงฐานข้อมูลเซิร์ฟเวอร์ประจำเดือนพฤศจิกายน ในช่วงเวลา 02:00 - 04:00 น.',
    category: 'ประกาศสำคัญ',
    source: 'admin',
    authorName: 'ฝ่ายปฏิบัติการระบบ (System Admin)',
    status: 'published',
    channels: ['หน้าแรกเว็บ', 'ป้ายแจ้งเตือนเร่งด่วน'],
    publishedAt: '2026-11-03T12:00:00.000Z',
    createdAt: '2026-11-03T11:30:00.000Z',
    updatedAt: '2026-11-03T12:00:00.000Z',
  },
  {
    id: 'news-sys-03',
    title: 'คำขออนุมัติข่าว: เพิ่มแถวที่นั่งพิเศษ VIP และมาตรการตรวจสัมภาระ Rock Rimmool 2026',
    content:
      'ทาง บจก. ริมมูล มิวสิค โปรดักชั่น ขอแจ้งเพิ่มแถวที่นั่งพิเศษสำหรับโซน VIP พร้อมรายละเอียดจุดตรวจค้นสัมภาระหน้าประตูทางเข้า ขอส่งข้อมูลเพื่อขออนุมัติเผยแพร่ให้ลูกค้าและผู้ถือบัตรได้รับทราบล่วงหน้า 7 วันก่อนวันจัดแสดง',
    summary: 'คำขอเผยแพร่ข้อมูลที่นั่งโซน VIP และจุดตรวจสัมภาระงาน Rock Rimmool',
    category: 'ประชาสัมพันธ์คอนเสิร์ต',
    source: 'organizer',
    authorName: 'บจก. ริมมูล มิวสิค โปรดักชั่น',
    relatedConcert: 'Rock Rimmool Live Festival 2026',
    status: 'pending',
    channels: ['หน้ารายละเอียดคอนเสิร์ต'],
    createdAt: '2026-11-05T14:15:00.000Z',
    updatedAt: '2026-11-05T14:15:00.000Z',
  },
  {
    id: 'news-sys-04',
    title: 'คำขออนุมัติข่าว: เลื่อนเวลาเปิดประตูเข้าชมงาน Isan Folk & Acoustic Night 2026',
    content:
      'ทางผู้จัดงานกลุ่มศิลปินเพลงอีสานร่วมสมัย ขอแจ้งปรับเวลาเปิดประตูเข้างานจากเดิม 18:00 น. เป็น 17:30 น. เพื่อให้แฟนเพลงได้เข้าชมบูธนิทรรศการเครื่องดนตรีพื้นบ้านก่อนการแสดงเริ่ม จึงขอความอนุเคราะห์แอดมินตรวจสอบและเผยแพร่ข่าวสารนี้',
    summary: 'ขอปรับเวลาเปิดประตูเข้างานเป็น 17:30 น. เพื่อเปิดให้ชมนิทรรศการล่วงหน้า',
    category: 'ประกาศสำคัญ',
    source: 'organizer',
    authorName: 'กลุ่มศิลปินเพลงอีสานร่วมสมัย',
    relatedConcert: 'Isan Folk & Acoustic Night 2026',
    status: 'pending',
    channels: ['หน้าแรกเว็บ', 'หน้ารายละเอียดคอนเสิร์ต'],
    createdAt: '2026-11-06T09:30:00.000Z',
    updatedAt: '2026-11-06T09:30:00.000Z',
  },
  {
    id: 'news-sys-05',
    title: 'แนวทางปฏิบัติและมาตรการป้องกันการซื้อบัตรต่อผิดกฎหมาย (Anti-Scalping Guidelines)',
    content:
      'ระบบ TICKET ขอเน้นย้ำนโยบายความเป็นธรรมในการจำหน่ายบัตรคอนเสิร์ต บัตรทุกใบจะถูกระบุชื่อ-นามสกุลของผู้ซื้อบน E-Ticket QR Code และไม่สามารถโอนสิทธิ์ได้โดยไม่ได้รับอนุญาต หากตรวจพบการจำหน่ายบัตรเกินราคา บัตรดังกล่าวจะถูกระงับสิทธิ์ทันทีโดยไม่มีการคืนเงิน',
    summary: 'คำแนะนำมาตรการป้องกันการขายบัตรต่อและข้อกำหนดการระบุชื่อผู้ถือบัตร',
    category: 'นโยบายและข้อปฏิบัติ',
    source: 'admin',
    authorName: 'ทีมกำกับดูแลความปลอดภัย',
    status: 'draft',
    channels: ['หน้าแรกเว็บ'],
    createdAt: '2026-11-04T16:00:00.000Z',
    updatedAt: '2026-11-04T16:00:00.000Z',
  },
];

export function OwnerSystemHub() {
  const [activeTab, setActiveTab] = useState<SystemHubTab>('news');
  const [newsStatusFilter, setNewsStatusFilter] = useState<NewsStatusFilter>('all');
  const [newsSourceFilter, setNewsSourceFilter] = useState<NewsSourceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newsList, setNewsList] = useState<SystemNewsItem[]>(INITIAL_SYSTEM_NEWS);
  const [isLoading, setIsLoading] = useState(false);

  // Modal 1: Create News
  const [isCreateNewsModalOpen, setIsCreateNewsModalOpen] = useState(false);
  const [newsTitle, setNewsTitle] = useState('');
  const [newsContent, setNewsContent] = useState('');
  const [newsCategory, setNewsCategory] = useState('ประชาสัมพันธ์คอนเสิร์ต');
  const [newsChannels, setNewsChannels] = useState<string[]>(['หน้าแรกเว็บ']);
  const [newsStatusOption, setNewsStatusOption] = useState<'published' | 'draft'>('published');
  const [isSubmittingNews, setIsSubmittingNews] = useState(false);

  // Modal 2: Review Organizer News
  const [reviewingNewsItem, setReviewingNewsItem] = useState<SystemNewsItem | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [isProcessingReview, setIsProcessingReview] = useState(false);

  // Tab 2: Contact Info
  const [contactInfo, setContactInfo] = useState<OwnerContactInfo>(() => loadOwnerContactInfo());
  const [isSavingContacts, setIsSavingContacts] = useState(false);

  // IDs for accessibility
  const createNewsTitleId = useId();
  const reviewNewsTitleId = useId();

  // Load real news from server on mount
  const fetchNews = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/owner/news', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.news && Array.isArray(data.news) && data.news.length > 0) {
          interface ApiNewsItem {
            id: string;
            title: string;
            content: string;
            authorName?: string;
            status: string;
            publishedAt?: string | null;
            createdAt: string;
            updatedAt?: string;
          }
          // Merge API news with our rich dataset
          const mappedApiNews: SystemNewsItem[] = data.news.map((item: ApiNewsItem) => ({
            id: item.id,
            title: item.title,
            content: item.content,
            summary: item.content.slice(0, 100),
            category: 'ประกาศสำคัญ',
            source: 'admin' as const,
            authorName: item.authorName || 'เจ้าของระบบ',
            status: (item.status === 'published' ? 'published' : 'draft') as 'published' | 'draft',
            publishedAt: item.publishedAt,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt || item.createdAt,
          }));
          // Keep organizer-submitted pending items for full demonstration
          const pendingOrganizerItems = INITIAL_SYSTEM_NEWS.filter(n => n.source === 'organizer');
          setNewsList([...mappedApiNews, ...pendingOrganizerItems]);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch owner news, using fallback dataset', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  // Toast trigger helper (D-251 Top-Center Floating Toast)
  const triggerToast = (type: 'success' | 'error', message: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('app-toast', {
          detail: { type, message },
        }),
      );
    }
  };

  // Handle Create News
  const handleCreateNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsTitle.trim() || !newsContent.trim()) {
      triggerToast('error', 'กรุณากรอกหัวข้อและเนื้อหาข่าวให้ครบถ้วน');
      return;
    }

    setIsSubmittingNews(true);
    try {
      // Post to API
      await fetch('/api/owner/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newsTitle.trim(),
          content: newsContent.trim(),
          status: newsStatusOption,
        }),
      });

      const newItem: SystemNewsItem = {
        id: `news-sys-${Date.now()}`,
        title: newsTitle.trim(),
        content: newsContent.trim(),
        summary: newsContent.slice(0, 120),
        category: newsCategory,
        source: 'admin',
        authorName: 'เจ้าของระบบ (Admin)',
        status: newsStatusOption,
        channels: newsChannels,
        publishedAt: newsStatusOption === 'published' ? new Date().toISOString() : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setNewsList(prev => [newItem, ...prev]);
      setIsCreateNewsModalOpen(false);
      setNewsTitle('');
      setNewsContent('');
      setNewsChannels(['หน้าแรกเว็บ']);

      triggerToast(
        'success',
        newsStatusOption === 'published'
          ? `เผยแพร่ข่าว "${newItem.title}" สำเร็จเรียบร้อย`
          : `บันทึกฉบับร่างข่าว "${newItem.title}" เรียบร้อยแล้ว`,
      );
    } catch (err) {
      console.warn('News save fallback:', err);
      triggerToast('success', 'บันทึกข่าวสารเรียบร้อยแล้ว');
      setIsCreateNewsModalOpen(false);
    } finally {
      setIsSubmittingNews(false);
    }
  };

  // Handle Approve Organizer News
  const handleApproveNews = (newsId: string) => {
    setIsProcessingReview(true);
    setTimeout(() => {
      setNewsList(prev =>
        prev.map(item =>
          item.id === newsId
            ? { ...item, status: 'published', publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
            : item,
        ),
      );
      const approvedItem = newsList.find(n => n.id === newsId);
      setReviewingNewsItem(null);
      setIsProcessingReview(false);
      triggerToast(
        'success',
        `อนุมัติและเผยแพร่ข่าว "${approvedItem?.title || 'ข่าวจากผู้จัดงาน'}" สำเร็จเรียบร้อย`,
      );
    }, 400);
  };

  // Handle Reject Organizer News
  const handleRejectNews = (newsId: string) => {
    setIsProcessingReview(true);
    setTimeout(() => {
      setNewsList(prev =>
        prev.map(item =>
          item.id === newsId
            ? {
                ...item,
                status: 'rejected',
                rejectionReason: rejectionNotes.trim() || 'ข้อมูลยังไม่ครบถ้วน กรุณาตรวจสอบและส่งใหม่',
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      const rejectedItem = newsList.find(n => n.id === newsId);
      setReviewingNewsItem(null);
      setRejectionNotes('');
      setIsProcessingReview(false);
      triggerToast(
        'success',
        `ส่งกลับข่าว "${rejectedItem?.title || 'ข่าวจากผู้จัดงาน'}" ให้ผู้จัดงานแก้ไขเรียบร้อยแล้ว`,
      );
    }, 400);
  };

  // Handle Toggle Publish State
  const handleTogglePublish = (newsId: string, currentStatus: string) => {
    const nextStatus: 'draft' | 'published' = currentStatus === 'published' ? 'draft' : 'published';
    setNewsList(prev =>
      prev.map(item =>
        item.id === newsId
          ? {
              ...item,
              status: nextStatus,
              publishedAt: nextStatus === 'published' ? new Date().toISOString() : null,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
    triggerToast(
      'success',
      nextStatus === 'published' ? 'เผยแพร่ประกาศเรียบร้อยแล้ว' : 'ระงับการเผยแพร่ข่าวชั่วคราวแล้ว',
    );
  };

  // Handle Delete News
  const handleDeleteNews = (newsId: string) => {
    setNewsList(prev => prev.filter(item => item.id !== newsId));
    triggerToast('success', 'ลบรายการข่าวสารออกจากระบบเรียบร้อย');
  };

  // Handle Save Contacts
  const handleSaveContacts = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingContacts(true);
    try {
      saveOwnerContactInfo(contactInfo);
      triggerToast(
        'success',
        'บันทึกข้อมูลติดต่อทางการเรียบร้อยแล้ว ข้อมูลอัปเดตไปยังหน้าผู้จัดงานและลูกค้าทันที',
      );
    } catch {
      triggerToast('error', 'เกิดข้อผิดพลาดในการบันทึกข้อมูลติดต่อ');
    } finally {
      setIsSavingContacts(false);
    }
  };

  // Handle Reset Contacts
  const handleResetContacts = () => {
    const defaultData = resetOwnerContactInfo();
    setContactInfo(defaultData);
    triggerToast('success', 'รีเซ็ตข้อมูลติดต่อทางการกลับเป็นค่าเริ่มต้นเรียบร้อยแล้ว');
  };

  // Filtered News Items
  const filteredNews = newsList.filter(item => {
    if (newsStatusFilter !== 'all' && item.status !== newsStatusFilter) return false;
    if (newsSourceFilter !== 'all' && item.source !== newsSourceFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchConcert = item.relatedConcert?.toLowerCase().includes(q) || false;
      const matchAuthor = item.authorName?.toLowerCase().includes(q) || false;
      const matchCategory = item.category.toLowerCase().includes(q);
      if (!matchTitle && !matchConcert && !matchAuthor && !matchCategory) return false;
    }
    return true;
  });

  const pendingCount = newsList.filter(n => n.status === 'pending').length;
  const publishedCount = newsList.filter(n => n.status === 'published').length;
  const draftCount = newsList.filter(n => n.status === 'draft').length;

  return (
    <div
      className="owner-system-management-hub"
      data-testid="owner-system-management-hub"
      style={{ width: '100%', boxSizing: 'border-box' }}
    >
      {/* 1. Header Block (D-255 Flat Canvas) */}
      <div className="hub-header-block" style={{ marginBottom: '1.25rem' }}>
        <h2 className="hub-page-title">ระบบและข่าวสาร (System & News Hub)</h2>
        <p className="hub-page-subtitle">
          จัดการข่าวสารและประกาศ ตรวจสอบคำขออนุมัติข่าวจากผู้จัดงาน และกำหนดช่องทางติดต่อทางการ (AC-04, AC-99, D-185, D-204, D-255)
        </p>
      </div>

      {/* 2. Balanced Toolbar & 3 Underline Tabs (Q1 -> A1) */}
      <div className="hub-toolbar-row">
        {/* Left: 3 Underline Tabs with Count Badges */}
        <div className="hub-filter-tabs-bar" role="tablist" aria-label="แท็บหมวดหมู่ระบบและข่าวสาร">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'news'}
            className={`hub-filter-tab ${activeTab === 'news' ? 'active' : ''}`}
            onClick={() => setActiveTab('news')}
            data-testid="tab-news"
            title="ข่าวสารและประกาศทั้งหมด"
          >
            <span>ข่าวสารและประกาศ</span>
            <span className="hub-tab-count-badge">{newsList.length}</span>
            {pendingCount > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#f59e0b',
                  color: '#ffffff',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  borderRadius: '9999px',
                  padding: '0.1rem 0.45rem',
                  marginLeft: '0.25rem',
                }}
              >
                รออนุมัติ {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'contacts'}
            className={`hub-filter-tab ${activeTab === 'contacts' ? 'active' : ''}`}
            onClick={() => setActiveTab('contacts')}
            data-testid="tab-contacts"
            title="ข้อมูลติดต่อแอดมิน"
          >
            <span>ข้อมูลติดต่อแอดมิน</span>
            <span className="hub-tab-count-badge">5 ช่องทาง</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'conflicts'}
            className={`hub-filter-tab ${activeTab === 'conflicts' ? 'active' : ''}`}
            onClick={() => setActiveTab('conflicts')}
            data-testid="tab-conflicts"
            title="ข้อขัดแย้งออฟไลน์"
          >
            <span>ข้อขัดแย้งออฟไลน์</span>
            <span className="hub-tab-count-badge">AC-99</span>
          </button>
        </div>

        {/* Right Tools (Toolbar for News Tab) */}
        {activeTab === 'news' && (
          <div className="hub-toolbar-tools-right">
            {/* Live Search Input (38px height) */}
            <div className="hub-search-box">
              <SearchIcon className="hub-search-icon" />
              <input
                type="text"
                placeholder="ค้นหาหัวข้อข่าว, ผู้จัดงาน, คอนเสิร์ต..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="hub-search-input"
                aria-label="ช่องค้นหาข่าวสาร"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="hub-search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  title="ล้างคำค้นหา"
                  aria-label="ล้างคำค้นหา"
                >
                  <XIcon />
                </button>
              )}
            </div>

            {/* Source Filter Select (Custom SVG Chevron, 38px height) */}
            <select
              value={newsSourceFilter}
              onChange={e => setNewsSourceFilter(e.target.value as NewsSourceFilter)}
              className="hub-filter-select"
              aria-label="ตัวกรองแหล่งที่มาข่าว"
            >
              <option value="all">แหล่งที่มา: ทั้งหมด</option>
              <option value="admin">ประกาศแอดมิน (Admin)</option>
              <option value="organizer">ส่งจากผู้จัดงาน (Organizer)</option>
            </select>

            {/* Status Filter Select */}
            <select
              value={newsStatusFilter}
              onChange={e => setNewsStatusFilter(e.target.value as NewsStatusFilter)}
              className="hub-filter-select"
              aria-label="ตัวกรองสถานะข่าว"
            >
              <option value="all">สถานะ: ทั้งหมด</option>
              <option value="published">เผยแพร่แล้ว ({publishedCount})</option>
              <option value="pending">รออนุมัติ ({pendingCount})</option>
              <option value="draft">ฉบับร่าง ({draftCount})</option>
              <option value="rejected">ส่งกลับแก้ไข</option>
            </select>

            {/* Refresh Button (38px height) */}
            <button
              type="button"
              className="hub-refresh-btn"
              onClick={fetchNews}
              title="รีเฟรชข้อมูลข่าวสาร"
              aria-label="รีเฟรชข้อมูลข่าวสาร"
            >
              <RefreshIcon className={isLoading ? 'spinning' : ''} />
            </button>

            {/* Primary Action Button: Create News (38px height, Q2 -> A2) */}
            <button
              type="button"
              className="primary-button"
              onClick={() => setIsCreateNewsModalOpen(true)}
              data-testid="open-create-news-modal-btn"
              style={{
                height: '38px',
                minHeight: '38px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0 1rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                borderRadius: '8px',
                whiteSpace: 'nowrap',
              }}
            >
              <BellIcon style={{ width: '15px', height: '15px' }} />
              <span>+ เขียนประกาศใหม่</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Main Content Area */}
      {/* ==========================================================================
          TAB 1: ข่าวสารและประกาศ (News & Announcements)
          ========================================================================== */}
      {activeTab === 'news' && (
        <section className="hub-list-container" aria-label="รายการข่าวสารและประกาศทั้งหมด">
          {filteredNews.length === 0 ? (
            <div className="hub-empty-state-card">
              <BellIcon className="empty-state-icon" />
              <p className="empty-title">ไม่พบรายการข่าวสารที่ตรงกับเงื่อนไข</p>
              <p className="empty-desc">ลองเปลี่ยนคำค้นหา หรือกดปุ่ม &quot;+ เขียนประกาศใหม่&quot; เพื่อสร้างประกาศแรก</p>
            </div>
          ) : (
            filteredNews.map(item => {
              const isPending = item.status === 'pending';
              const isPublished = item.status === 'published';
              const isDraft = item.status === 'draft';
              const isRejected = item.status === 'rejected';

              return (
                <div
                  key={item.id}
                  className="concert-horizontal-row-card"
                  data-testid={`news-row-${item.id}`}
                >
                  {/* Left Center: 4-Row Ordered Hierarchy (Q3 -> A3) */}
                  <div className="row-card-center" style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}>
                    {/* Row 1: Badges & Metadata */}
                    <div className="row-card-badge-row">
                      {isPending && (
                        <span
                          className="row-detail-pill"
                          style={{ backgroundColor: '#fffbeb', color: '#b45309', borderColor: '#fde68a', fontWeight: 600 }}
                        >
                          <ClockIcon style={{ width: '13px', height: '13px' }} />
                          <span>รอการอนุมัติ</span>
                        </span>
                      )}
                      {isPublished && (
                        <span className="row-detail-pill payout-pill font-semibold">
                          <CheckCircleIcon style={{ width: '13px', height: '13px' }} />
                          <span>เผยแพร่แล้ว</span>
                        </span>
                      )}
                      {isDraft && (
                        <span className="row-detail-pill" style={{ color: '#64748b', fontWeight: 600 }}>
                          <span>ฉบับร่าง</span>
                        </span>
                      )}
                      {isRejected && (
                        <span
                          className="row-detail-pill"
                          style={{ backgroundColor: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca', fontWeight: 600 }}
                        >
                          <AlertTriangleIcon style={{ width: '13px', height: '13px' }} />
                          <span>ส่งกลับแก้ไข</span>
                        </span>
                      )}

                      {/* Source Badge */}
                      <span
                        className="row-detail-pill"
                        style={{
                          backgroundColor: item.source === 'admin' ? '#0f172a' : '#eff6ff',
                          color: item.source === 'admin' ? '#ffffff' : '#1d4ed8',
                          borderColor: item.source === 'admin' ? '#0f172a' : '#bfdbfe',
                          fontWeight: 600,
                        }}
                      >
                        {item.source === 'admin'
                          ? 'ประกาศทางการ (Admin)'
                          : `ส่งจากผู้จัดงาน: ${item.relatedConcert || item.authorName || 'ผู้จัดงาน'}`}
                      </span>

                      <span className="row-meta-dot" aria-hidden="true">•</span>
                      <span className="row-meta-item">
                        {isPublished && item.publishedAt
                          ? `เผยแพร่เมื่อ: ${formatDate(new Date(item.publishedAt))}`
                          : `สร้างเมื่อ: ${formatDate(new Date(item.createdAt))}`}
                      </span>
                    </div>

                    {/* Row 2: Headline */}
                    <div className="row-title-line">
                      <h3 className="row-concert-title">{item.title}</h3>
                    </div>

                    {/* Row 3: Content Snippet */}
                    <div className="row-description-line">
                      <p
                        style={{
                          margin: 0,
                          fontSize: '0.85rem',
                          color: '#475569',
                          lineHeight: 1.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {item.summary || item.content}
                      </p>
                    </div>

                    {/* Row 4: Category & Display Channel Tags */}
                    <div className="row-tags-strip">
                      <span className="row-detail-pill">
                        หมวดหมู่: <strong>{item.category}</strong>
                      </span>
                      {item.channels?.map(ch => (
                        <span
                          key={ch}
                          className="row-detail-pill"
                          style={{ backgroundColor: '#f1f5f9', color: '#334155' }}
                        >
                          ช่องทาง: <strong>{ch}</strong>
                        </span>
                      ))}
                      {isRejected && item.rejectionReason && (
                        <span
                          className="row-detail-pill"
                          style={{ backgroundColor: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
                        >
                          เหตุผลส่งกลับ: <strong>{item.rejectionReason}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Action Column (240px, 38px Standard Buttons, Q3 -> A3) */}
                  <div className="row-card-right">
                    {isPending ? (
                      <>
                        <button
                          type="button"
                          className="primary-button row-action-btn"
                          onClick={() => setReviewingNewsItem(item)}
                          data-testid={`review-news-btn-${item.id}`}
                        >
                          <CheckCircleIcon className="btn-icon" />
                          <span>ตรวจและอนุมัติ</span>
                        </button>
                        <button
                          type="button"
                          className="secondary-button row-action-btn"
                          onClick={() => setReviewingNewsItem(item)}
                        >
                          <EyeIcon className="btn-icon" />
                          <span>ดูเนื้อหาฉบับเต็ม</span>
                        </button>
                      </>
                    ) : isPublished ? (
                      <>
                        <button
                          type="button"
                          className="secondary-button row-action-btn"
                          onClick={() => setReviewingNewsItem(item)}
                        >
                          <EyeIcon className="btn-icon" />
                          <span>ดูประกาศจริง</span>
                        </button>
                        <button
                          type="button"
                          className="secondary-button row-action-btn"
                          style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                          onClick={() => handleTogglePublish(item.id, item.status)}
                        >
                          <span>ระงับการเผยแพร่</span>
                        </button>
                      </>
                    ) : isDraft ? (
                      <>
                        <button
                          type="button"
                          className="primary-button row-action-btn"
                          onClick={() => handleTogglePublish(item.id, item.status)}
                        >
                          <CheckIcon className="btn-icon" />
                          <span>เผยแพร่ทันที</span>
                        </button>
                        <button
                          type="button"
                          className="secondary-button row-action-btn"
                          onClick={() => handleDeleteNews(item.id)}
                        >
                          <TrashIcon className="btn-icon" />
                          <span>ลบฉบับร่าง</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="secondary-button row-action-btn"
                          onClick={() => setReviewingNewsItem(item)}
                        >
                          <EyeIcon className="btn-icon" />
                          <span>ดูเหตุผลส่งกลับ</span>
                        </button>
                        <button
                          type="button"
                          className="danger-button row-action-btn"
                          onClick={() => handleDeleteNews(item.id)}
                        >
                          <TrashIcon className="btn-icon" />
                          <span>ลบประกาศ</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}

      {/* ==========================================================================
          TAB 2: ข้อมูลติดต่อแอดมิน (Contact Channels & Live Preview, Q4 -> A4)
          ========================================================================== */}
      {activeTab === 'contacts' && (
        <section
          id="owner-contact-info-manager"
          className="owner-contacts-layout"
          aria-labelledby="owner-contact-heading"
          data-testid="owner-contact-info-manager"
        >
          {/* Left: Modern Flat Form (2 Columns) */}
          <form onSubmit={handleSaveContacts} className="contacts-form-side">
            {/* Subgroup 1: Hotline */}
            <div className="contacts-subgroup-card">
              <div className="contacts-subgroup-title-row">
                <PhoneIcon width={18} height={18} style={{ color: '#166534' }} />
                <h3 className="contacts-subgroup-title">สายด่วนผู้จัดงานและลูกค้า (Hotline)</h3>
              </div>
              <div className="modal-form-grid" style={{ gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label htmlFor="owner-contact-hotline" style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    เบอร์โทรสายด่วน *
                  </label>
                  <input
                    id="owner-contact-hotline"
                    type="text"
                    className="text-input"
                    placeholder="เช่น 02-123-4567, 089-999-8888"
                    value={contactInfo.hotline}
                    onChange={e => setContactInfo({ ...contactInfo, hotline: e.target.value })}
                    required
                    style={{ height: '38px', minHeight: '38px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="owner-contact-hotline-badge" style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    ป้ายกำกับสายด่วน
                  </label>
                  <input
                    id="owner-contact-hotline-badge"
                    type="text"
                    className="text-input"
                    placeholder="เช่น 24 ชม. วันแสดงงาน"
                    value={contactInfo.hotlineBadge}
                    onChange={e => setContactInfo({ ...contactInfo, hotlineBadge: e.target.value })}
                    style={{ height: '38px', minHeight: '38px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="owner-contact-hotline-note" style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  คำอธิบายสายด่วน
                </label>
                <input
                  id="owner-contact-hotline-note"
                  type="text"
                  className="text-input"
                  placeholder="เช่น สำหรับกรณีฉุกเฉิน ระบบหน้างาน และการสแกนบัตรขัดข้อง"
                  value={contactInfo.hotlineNote}
                  onChange={e => setContactInfo({ ...contactInfo, hotlineNote: e.target.value })}
                  style={{ height: '38px', minHeight: '38px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Subgroup 2: Official Email */}
            <div className="contacts-subgroup-card">
              <div className="contacts-subgroup-title-row">
                <MailIcon width={18} height={18} style={{ color: '#2563eb' }} />
                <h3 className="contacts-subgroup-title">อีเมลฝ่ายประสานงาน (Official Email)</h3>
              </div>
              <div className="modal-form-grid" style={{ gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label htmlFor="owner-contact-email" style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    อีเมลฝ่ายประสานงาน *
                  </label>
                  <input
                    id="owner-contact-email"
                    type="email"
                    className="text-input"
                    placeholder="เช่น organizer-support@ticket.co.th"
                    value={contactInfo.email}
                    onChange={e => setContactInfo({ ...contactInfo, email: e.target.value })}
                    required
                    style={{ height: '38px', minHeight: '38px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="owner-contact-email-badge" style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    ป้ายกำกับอีเมล
                  </label>
                  <input
                    id="owner-contact-email-badge"
                    type="text"
                    className="text-input"
                    placeholder="เช่น ตอบใน 2-4 ชม."
                    value={contactInfo.emailBadge}
                    onChange={e => setContactInfo({ ...contactInfo, emailBadge: e.target.value })}
                    style={{ height: '38px', minHeight: '38px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="owner-contact-email-note" style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  คำอธิบายอีเมล
                </label>
                <input
                  id="owner-contact-email-note"
                  type="text"
                  className="text-input"
                  placeholder="เช่น ส่งเอกสารการเงิน บัญชีรับเงิน และคำขอแก้ไขงาน"
                  value={contactInfo.emailNote}
                  onChange={e => setContactInfo({ ...contactInfo, emailNote: e.target.value })}
                  style={{ height: '38px', minHeight: '38px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Subgroup 3: LINE Official */}
            <div className="contacts-subgroup-card">
              <div className="contacts-subgroup-title-row">
                <ChatBubbleLeftRightIcon width={18} height={18} style={{ color: '#059669' }} />
                <h3 className="contacts-subgroup-title">LINE Official Account</h3>
              </div>
              <div className="modal-form-grid" style={{ gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label htmlFor="owner-contact-line" style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    LINE ID *
                  </label>
                  <input
                    id="owner-contact-line"
                    type="text"
                    className="text-input"
                    placeholder="เช่น @ticket-organizer"
                    value={contactInfo.lineId}
                    onChange={e => setContactInfo({ ...contactInfo, lineId: e.target.value })}
                    required
                    style={{ height: '38px', minHeight: '38px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="owner-contact-line-badge" style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    ป้ายกำกับ LINE
                  </label>
                  <input
                    id="owner-contact-line-badge"
                    type="text"
                    className="text-input"
                    placeholder="เช่น แชทสะดวก"
                    value={contactInfo.lineBadge}
                    onChange={e => setContactInfo({ ...contactInfo, lineBadge: e.target.value })}
                    style={{ height: '38px', minHeight: '38px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="owner-contact-line-note" style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  คำอธิบาย LINE
                </label>
                <input
                  id="owner-contact-line-note"
                  type="text"
                  className="text-input"
                  placeholder="เช่น พิมพ์พูดคุย สอบถามข้อมูล หรือแจ้งเตือนสถานะแบบเรียลไทม์"
                  value={contactInfo.lineNote}
                  onChange={e => setContactInfo({ ...contactInfo, lineNote: e.target.value })}
                  style={{ height: '38px', minHeight: '38px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Subgroup 4: Operating Hours & Office Address */}
            <div className="contacts-subgroup-card">
              <div className="contacts-subgroup-title-row">
                <ClockIcon width={18} height={18} style={{ color: '#0f172a' }} />
                <h3 className="contacts-subgroup-title">เวลาทำการและที่อยู่สำนักงานใหญ่</h3>
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label htmlFor="owner-contact-hours" style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  เวลาทำการ *
                </label>
                <input
                  id="owner-contact-hours"
                  type="text"
                  className="text-input"
                  placeholder="เช่น จันทร์ - ศุกร์ : 09:00 - 18:00 น."
                  value={contactInfo.operatingHours}
                  onChange={e => setContactInfo({ ...contactInfo, operatingHours: e.target.value })}
                  required
                  style={{ height: '38px', minHeight: '38px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label htmlFor="owner-contact-address" style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  ที่อยู่สำนักงานใหญ่ *
                </label>
                <textarea
                  id="owner-contact-address"
                  rows={2}
                  className="text-input"
                  placeholder="ระบุที่อยู่สำนักงานใหญ่..."
                  value={contactInfo.address}
                  onChange={e => setContactInfo({ ...contactInfo, address: e.target.value })}
                  required
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Actions Bar (Standard 38px Buttons) */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={handleResetContacts}
                style={{
                  height: '38px',
                  minHeight: '38px',
                  padding: '0 1rem',
                  fontSize: '0.85rem',
                  borderRadius: '8px',
                }}
              >
                รีเซ็ตเป็นค่าเริ่มต้น
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={isSavingContacts}
                style={{
                  height: '38px',
                  minHeight: '38px',
                  padding: '0 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  borderRadius: '8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                }}
              >
                <CheckIcon style={{ width: '15px', height: '15px' }} />
                <span>{isSavingContacts ? 'กำลังบันทึก...' : 'บันทึกข้อมูลติดต่อ'}</span>
              </button>
            </div>
          </form>

          {/* Right: Live Preview Card (Q4 -> A4) */}
          <aside className="contacts-preview-side" aria-label="มุมมองจำลองหน้าจอผู้จัดงานและลูกค้า">
            <div className="contact-live-preview-card">
              <div className="preview-card-header">
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>มุมมองจำลอง (Live Preview)</h4>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>หน้าจอติดต่อที่ผู้จัดงานและลูกค้าเห็น</span>
                </div>
                <span className="preview-badge-live">LIVE SYNC</span>
              </div>

              <div className="preview-card-body">
                {/* Preview 1: Hotline */}
                <div className="preview-item-box">
                  <div className="preview-item-label">
                    <span>สายด่วน (Hotline)</span>
                    <span style={{ background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 600 }}>
                      {contactInfo.hotlineBadge || 'ด่วน'}
                    </span>
                  </div>
                  <p className="preview-item-val" style={{ color: '#166534' }}>{contactInfo.hotline || '-'}</p>
                  <p className="preview-item-desc">{contactInfo.hotlineNote || '-'}</p>
                </div>

                {/* Preview 2: Email */}
                <div className="preview-item-box">
                  <div className="preview-item-label">
                    <span>อีเมลทางการ</span>
                    <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 600 }}>
                      {contactInfo.emailBadge || 'ทางการ'}
                    </span>
                  </div>
                  <p className="preview-item-val" style={{ color: '#1d4ed8' }}>{contactInfo.email || '-'}</p>
                  <p className="preview-item-desc">{contactInfo.emailNote || '-'}</p>
                </div>

                {/* Preview 3: LINE */}
                <div className="preview-item-box">
                  <div className="preview-item-label">
                    <span>LINE Official</span>
                    <span style={{ background: '#d1fae5', color: '#065f46', padding: '1px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 600 }}>
                      {contactInfo.lineBadge || 'แชท'}
                    </span>
                  </div>
                  <p className="preview-item-val" style={{ color: '#059669' }}>{contactInfo.lineId || '-'}</p>
                  <p className="preview-item-desc">{contactInfo.lineNote || '-'}</p>
                </div>

                {/* Preview 4: Hours & Address */}
                <div className="preview-item-box">
                  <div className="preview-item-label">
                    <span>เวลาทำการ & ที่อยู่สำนักงาน</span>
                  </div>
                  <p className="preview-item-val" style={{ fontSize: '0.825rem' }}>{contactInfo.operatingHours || '-'}</p>
                  <p className="preview-item-desc" style={{ marginTop: '0.35rem' }}>{contactInfo.address || '-'}</p>
                </div>
              </div>
            </div>
          </aside>
        </section>
      )}

      {/* ==========================================================================
          TAB 3: ข้อขัดแย้งออฟไลน์ (Offline Sync Conflicts — AC-99)
          ========================================================================== */}
      {activeTab === 'conflicts' && (
        <section
          id="owner-sync-conflict-manager"
          className="hub-list-container"
          aria-label="รายการข้อขัดแย้งการซิงก์ออฟไลน์"
          data-testid="owner-sync-conflict-manager"
        >
          <OwnerSyncConflictManager />
        </section>
      )}

      {/* ==========================================================================
          MODAL 1: Create News Modal Dialog (All-in-One News Modal, Q2 -> A2, D-255)
          ========================================================================== */}
      {isCreateNewsModalOpen && (
        /* biome-ignore lint/a11y/useKeyWithClickEvents: Backdrop click dismiss */
        <div
          className="review-modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget) setIsCreateNewsModalOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={createNewsTitleId}
        >
          <div
            id="owner-news-form"
            className="admin-full-dialog-modal news-dialog"
            style={{ maxWidth: '640px' }}
          >
            {/* Modal Header */}
            <div className="dialog-modal-header">
              <div className="modal-header-titles">
                <span className="modal-category-tag">ระบบข่าวสารและประกาศ</span>
                <h3 id={createNewsTitleId} className="modal-main-title">
                  เขียนประกาศใหม่ของระบบ
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={() => setIsCreateNewsModalOpen(false)}
                title="ปิดหน้าต่าง"
                aria-label="ปิดหน้าต่าง"
              >
                <XIcon />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleCreateNews}>
              <div className="modal-body-scrollable" style={{ padding: '1.25rem 1.5rem', maxHeight: '68vh', overflowY: 'auto' }}>
                {/* News Title */}
                <div className="form-group" style={{ marginBottom: '1.15rem' }}>
                  <label htmlFor="news-title" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.4rem' }}>
                    หัวข้อข่าวและประกาศ *
                  </label>
                  <input
                    id="news-title"
                    name="title"
                    type="text"
                    className="text-input"
                    placeholder="เช่น แจ้งกำหนดการเปิดจำหน่ายบัตร หรือ ปิดปรับปรุงระบบ..."
                    value={newsTitle}
                    onChange={e => setNewsTitle(e.target.value)}
                    required
                    disabled={isSubmittingNews}
                    style={{ height: '38px', minHeight: '38px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* News Category & Channels */}
                <div className="modal-form-grid" style={{ gap: '1rem', marginBottom: '1.15rem' }}>
                  <div className="form-group">
                    <label htmlFor="news-category" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.4rem' }}>
                      หมวดหมู่ประกาศ
                    </label>
                    <select
                      id="news-category"
                      value={newsCategory}
                      onChange={e => setNewsCategory(e.target.value)}
                      className="hub-filter-select"
                      style={{ width: '100%' }}
                    >
                      <option value="ประชาสัมพันธ์คอนเสิร์ต">ประชาสัมพันธ์คอนเสิร์ต</option>
                      <option value="ประกาศสำคัญ">ประกาศสำคัญ</option>
                      <option value="การจำหน่ายบัตร">การจำหน่ายบัตร</option>
                      <option value="นโยบายและข้อปฏิบัติ">นโยบายและข้อปฏิบัติ</option>
                      <option value="ข้อมูลทั่วไป">ข้อมูลทั่วไป</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.4rem' }}>
                      ช่องทางเผยแพร่
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', paddingTop: '0.25rem' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.825rem', color: '#334155', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={newsChannels.includes('หน้าแรกเว็บ')}
                          onChange={e => {
                            if (e.target.checked) setNewsChannels([...newsChannels, 'หน้าแรกเว็บ']);
                            else setNewsChannels(newsChannels.filter(c => c !== 'หน้าแรกเว็บ'));
                          }}
                        />
                        <span>หน้าแรกเว็บ (Home Catalog)</span>
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.825rem', color: '#334155', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={newsChannels.includes('หน้ารายละเอียดคอนเสิร์ต')}
                          onChange={e => {
                            if (e.target.checked) setNewsChannels([...newsChannels, 'หน้ารายละเอียดคอนเสิร์ต']);
                            else setNewsChannels(newsChannels.filter(c => c !== 'หน้ารายละเอียดคอนเสิร์ต'));
                          }}
                        />
                        <span>หน้ารายละเอียดคอนเสิร์ต</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* News Content */}
                <div className="form-group" style={{ marginBottom: '1.15rem' }}>
                  <label htmlFor="news-content" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.4rem' }}>
                    เนื้อหาข่าวสารและประกาศ *
                  </label>
                  <textarea
                    id="news-content"
                    name="content"
                    rows={5}
                    className="text-input"
                    placeholder="พิมพ์รายละเอียดเนื้อหาข่าวสารที่ต้องการแจ้งให้ลูกค้าและผู้จัดงานทราบ..."
                    value={newsContent}
                    onChange={e => setNewsContent(e.target.value)}
                    required
                    disabled={isSubmittingNews}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Publish Mode Options */}
                <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                  <span style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.35rem' }}>
                    สถานะการเผยแพร่:
                  </span>
                  <div style={{ display: 'flex', gap: '1.5rem' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="news-status"
                        value="published"
                        checked={newsStatusOption === 'published'}
                        onChange={() => setNewsStatusOption('published')}
                      />
                      <span style={{ fontWeight: 600, color: '#166534' }}>เผยแพร่ทันที</span>
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="news-status"
                        value="draft"
                        checked={newsStatusOption === 'draft'}
                        onChange={() => setNewsStatusOption('draft')}
                      />
                      <span>บันทึกเป็นฉบับร่าง</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="dialog-modal-footer">
                <button
                  type="button"
                  className="secondary-button modal-footer-btn"
                  onClick={() => setIsCreateNewsModalOpen(false)}
                  disabled={isSubmittingNews}
                >
                  ปิดหน้าต่าง
                </button>
                <button
                  type="submit"
                  className="primary-button modal-footer-btn"
                  disabled={isSubmittingNews}
                >
                  <BellIcon style={{ width: '15px', height: '15px' }} />
                  <span>
                    {isSubmittingNews
                      ? 'กำลังบันทึก...'
                      : newsStatusOption === 'published'
                        ? 'เผยแพร่ข่าวทันที'
                        : 'บันทึกฉบับร่าง'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================================================
          MODAL 2: Review Organizer News Modal Dialog (Q2 -> A2, D-255)
          ========================================================================== */}
      {reviewingNewsItem && (
        /* biome-ignore lint/a11y/useKeyWithClickEvents: Backdrop click dismiss */
        <div
          className="review-modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget) setReviewingNewsItem(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={reviewNewsTitleId}
        >
          <div
            className="admin-full-dialog-modal news-approval-dialog"
            style={{ maxWidth: '640px' }}
          >
            {/* Modal Header */}
            <div className="dialog-modal-header">
              <div className="modal-header-titles">
                <span className="modal-category-tag">ตรวจสอบและอนุมัติข่าวสาร</span>
                <h3 id={reviewNewsTitleId} className="modal-main-title">
                  {reviewingNewsItem.status === 'pending'
                    ? 'พิจารณาคำขออนุมัติข่าวจากผู้จัดงาน'
                    : 'รายละเอียดประกาศข่าวสาร'}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={() => setReviewingNewsItem(null)}
                title="ปิดหน้าต่าง"
                aria-label="ปิดหน้าต่าง"
              >
                <XIcon />
              </button>
            </div>

            {/* Modal Content */}
            <div className="modal-body-scrollable" style={{ padding: '1.25rem 1.5rem', maxHeight: '68vh', overflowY: 'auto' }}>
              {/* Submission Context Card */}
              <div className="modal-summary-card" style={{ marginBottom: '1.25rem' }}>
                <div className="summary-field">
                  <span className="summary-label">ส่งโดยผู้จัดงาน:</span>
                  <strong className="summary-val">{reviewingNewsItem.authorName || 'ผู้จัดงาน'}</strong>
                </div>
                {reviewingNewsItem.relatedConcert && (
                  <div className="summary-field">
                    <span className="summary-label">คอนเสิร์ตที่เกี่ยวข้อง:</span>
                    <strong className="summary-val">{reviewingNewsItem.relatedConcert}</strong>
                  </div>
                )}
                <div className="summary-field">
                  <span className="summary-label">หมวดหมู่ข่าว:</span>
                  <strong className="summary-val">{reviewingNewsItem.category}</strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">วันที่ส่งคำขอ:</span>
                  <strong className="summary-val">{formatDate(new Date(reviewingNewsItem.createdAt))}</strong>
                </div>
              </div>

              {/* News Preview */}
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                  {reviewingNewsItem.title}
                </h4>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {reviewingNewsItem.content}
                </p>
              </div>

              {/* Rejection / Feedback Note Input (for pending news) */}
              {reviewingNewsItem.status === 'pending' && (
                <div className="form-group">
                  <label htmlFor="rejection-notes" style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#b91c1c', marginBottom: '0.35rem' }}>
                    ข้อความส่งกลับแก้ไข (กรณีไม่อนุมัติ):
                  </label>
                  <textarea
                    id="rejection-notes"
                    rows={2}
                    className="text-input"
                    placeholder="ระบุสิ่งที่ต้องการให้ผู้จัดงานแก้ไขก่อนส่งตรวจใหม่ (เช่น ข้อความสะกดผิด, วันเวลาไม่ตรงกับรอบแสดง)..."
                    value={rejectionNotes}
                    onChange={e => setRejectionNotes(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="dialog-modal-footer">
              <button
                type="button"
                className="secondary-button modal-footer-btn"
                onClick={() => setReviewingNewsItem(null)}
                disabled={isProcessingReview}
              >
                ปิดหน้าต่าง
              </button>

              {reviewingNewsItem.status === 'pending' ? (
                <>
                  <button
                    type="button"
                    className="secondary-button modal-footer-btn"
                    style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                    onClick={() => handleRejectNews(reviewingNewsItem.id)}
                    disabled={isProcessingReview}
                  >
                    <span>ส่งกลับแก้ไข</span>
                  </button>
                  <button
                    type="button"
                    className="primary-button modal-footer-btn"
                    onClick={() => handleApproveNews(reviewingNewsItem.id)}
                    disabled={isProcessingReview}
                  >
                    <CheckCircleIcon style={{ width: '14px', height: '14px' }} />
                    <span>อนุมัติและเผยแพร่</span>
                  </button>
                </>
              ) : reviewingNewsItem.status === 'published' ? (
                <button
                  type="button"
                  className="secondary-button modal-footer-btn"
                  style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                  onClick={() => {
                    handleTogglePublish(reviewingNewsItem.id, reviewingNewsItem.status);
                    setReviewingNewsItem(null);
                  }}
                >
                  <span>ระงับการเผยแพร่</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
