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
  PlusIcon,
  PencilSquareIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from './icons';
import { formatDate } from '@/lib/locale';
import {
  EMPTY_OWNER_CONTACT_INFO,
  loadSharedOwnerContactInfo,
  saveSharedOwnerContactInfo,
  type OwnerContactInfo,
} from '@/lib/owner-contact-sync';
import {
  loadHomeBanners,
  saveHomeBanners,
  resetHomeBanners,
  isBannerScheduleActive,
  type HeroBannerItem,
  type BannerType,
  type BannerLinkType,
  EVENT_HOME_BANNERS_CHANGED,
} from '@/lib/home-banners-sync';
import { OwnerSyncConflictManager } from './owner-sync-conflict-manager';

export type SystemHubTab = 'news' | 'banners' | 'contacts' | 'conflicts';
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

export function OwnerSystemHub() {
  const [activeTab, setActiveTab] = useState<SystemHubTab>('news');
  const [newsStatusFilter, setNewsStatusFilter] = useState<NewsStatusFilter>('all');
  const [newsSourceFilter, setNewsSourceFilter] = useState<NewsSourceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newsList, setNewsList] = useState<SystemNewsItem[]>([]);
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
  const isProcessingReview = false;

  // Tab 2: Contact Info
  const [contactInfo, setContactInfo] = useState<OwnerContactInfo>(EMPTY_OWNER_CONTACT_INFO);
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
        if (data.news && Array.isArray(data.news)) {
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
          setNewsList(mappedApiNews);
        }
      } else {
        throw new Error('โหลดข่าวสารไม่สำเร็จ');
      }
    } catch (err) {
      setNewsList([]);
      console.error('Failed to fetch owner news', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    loadSharedOwnerContactInfo().then(setContactInfo).catch(() => {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { type: 'error', message: 'โหลดข้อมูลติดต่อไม่สำเร็จ' } }));
    });
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
      const response = await fetch('/api/owner/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newsTitle.trim(),
          content: newsContent.trim(),
          status: newsStatusOption,
        }),
      });

      if (!response.ok) throw new Error('บันทึกข่าวสารไม่สำเร็จ');
      await fetchNews();
      setIsCreateNewsModalOpen(false);
      setNewsTitle('');
      setNewsContent('');
      setNewsChannels(['หน้าแรกเว็บ']);
      triggerToast('success', 'บันทึกข่าวสารเรียบร้อยแล้ว');
    } catch {
      triggerToast('error', 'บันทึกข่าวสารไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setIsSubmittingNews(false);
    }
  };

  // Organizer news review is unavailable until a server-backed workflow exists.
  const handleApproveNews = (_newsId: string) => {
    triggerToast('error', 'ยังไม่รองรับการอนุมัติข่าวจากผู้จัดงาน');
  };
  const handleRejectNews = (_newsId: string) => {
    triggerToast('error', 'ยังไม่รองรับการส่งข่าวกลับให้ผู้จัดงาน');
  };
  const handleTogglePublish = async (newsId: string, currentStatus: string) => {
    if (currentStatus === 'published') {
      triggerToast('error', 'ยังไม่รองรับการระงับข่าวที่เผยแพร่แล้ว');
      return;
    }
    try {
      const response = await fetch(`/api/owner/news/${newsId}/publish`, { method: 'POST' });
      if (!response.ok) throw new Error('เผยแพร่ข่าวไม่สำเร็จ');
      await fetchNews();
      triggerToast('success', 'เผยแพร่ข่าวเรียบร้อยแล้ว');
    } catch {
      triggerToast('error', 'เผยแพร่ข่าวไม่สำเร็จ');
    }
  };
  const handleDeleteNews = async (newsId: string) => {
    if (!window.confirm('ยืนยันที่จะลบข่าวสารนี้หรือไม่?')) return;
    try {
      const response = await fetch(`/api/owner/news/${newsId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('ลบข่าวไม่สำเร็จ');
      await fetchNews();
      triggerToast('success', 'ลบข่าวสารเรียบร้อยแล้ว');
    } catch {
      triggerToast('error', 'ลบข่าวสารไม่สำเร็จ');
    }
  };

  // Handle Save Contacts
  const handleSaveContacts = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingContacts(true);
    try {
      await saveSharedOwnerContactInfo(contactInfo);
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
  const handleResetContacts = async () => {
    if (!window.confirm('ล้างข้อมูลติดต่อที่บันทึกไว้ใช่หรือไม่?')) return;
    try {
      await saveSharedOwnerContactInfo(EMPTY_OWNER_CONTACT_INFO);
      setContactInfo(EMPTY_OWNER_CONTACT_INFO);
      triggerToast('success', 'ล้างข้อมูลติดต่อเรียบร้อยแล้ว');
    } catch {
      triggerToast('error', 'ล้างข้อมูลติดต่อไม่สำเร็จ');
    }
  };

  // ==========================================================================
  // TAB: Hero Banners Management (Q1A, Q2A, Q3A, Q4A)
  // ==========================================================================
  const [bannersList, setBannersList] = useState<HeroBannerItem[]>(() => loadHomeBanners());
  const [bannerSearchQuery, setBannerSearchQuery] = useState('');
  const [bannerStatusFilter, setBannerStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [bannerTypeFilter, setBannerTypeFilter] = useState<'all' | 'featured_concert' | 'custom'>('all');
  const [availableEvents, setAvailableEvents] = useState<
    Array<{ id: string; title: string; posterUrl?: string; coverBannerUrl?: string; location?: string }>
  >([
    {
      id: 'evt_rock_rimmool_2026',
      title: 'Rock Rimmool Live Festival 2026',
      posterUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=80',
      location: 'ริมแม่น้ำมูล อ.เมือง จ.อุบลราชธานี',
    },
    {
      id: 'evt_isan_folk_2026',
      title: 'Isan Folk & Acoustic Night 2026',
      posterUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1600&q=80',
      location: 'ลานวัฒนธรรมริมโขง อ.โขงเจียม จ.อุบลราชธานี',
    },
    {
      id: 'evt_ubu_freshy_2026',
      title: 'UBU Freshy Music Fest 2026',
      posterUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1600&q=80',
      location: 'ศูนย์ประชุม มหาวิทยาลัยอุบลราชธานี',
    },
  ]);

  // Load live events for concert picker
  useEffect(() => {
    fetch('/api/events')
      .then(res => res.json())
      .then(data => {
        if (data.events && Array.isArray(data.events) && data.events.length > 0) {
          interface RawApiEvent {
            id: string;
            title: string;
            posterUrl?: string;
            coverBannerUrl?: string;
            location?: string;
          }
          const mapped = data.events.map((e: RawApiEvent) => ({
            id: e.id,
            title: e.title,
            posterUrl: e.posterUrl || e.coverBannerUrl,
            coverBannerUrl: e.coverBannerUrl,
            location: e.location,
          }));
          setAvailableEvents(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newEvents = mapped.filter((m: RawApiEvent) => !existingIds.has(m.id));
            return [...prev, ...newEvents];
          });
        }
      })
      .catch(() => {});
  }, []);

  // Listen to banner updates
  useEffect(() => {
    const handleBannersSync = (e: Event) => {
      const customEvent = e as CustomEvent<HeroBannerItem[]>;
      if (customEvent.detail && Array.isArray(customEvent.detail)) {
        setBannersList(customEvent.detail);
      }
    };
    window.addEventListener(EVENT_HOME_BANNERS_CHANGED, handleBannersSync);
    return () => window.removeEventListener(EVENT_HOME_BANNERS_CHANGED, handleBannersSync);
  }, []);

  // Banner Modal State
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [formBannerType, setFormBannerType] = useState<BannerType>('featured_concert');
  const [formSelectedEventId, setFormSelectedEventId] = useState<string>('evt_rock_rimmool_2026');
  const [formBannerImageUrl, setFormBannerImageUrl] = useState('');
  const [formBannerLinkType, setFormBannerLinkType] = useState<BannerLinkType>('concert');
  const [formBannerCustomUrl, setFormBannerCustomUrl] = useState('');
  const [formBannerOrder, setFormBannerOrder] = useState<number>(1);
  const [formBannerIsActive, setFormBannerIsActive] = useState<boolean>(true);
  const [formBannerStartAt, setFormBannerStartAt] = useState<string>('');
  const [formBannerEndAt, setFormBannerEndAt] = useState<string>('');
  const bannerModalTitleId = useId();

  // Open Create Banner Modal (Q1A, Q2A Streamlined)
  const openCreateBannerModal = () => {
    setEditingBannerId(null);
    setFormBannerType('featured_concert');
    const firstEvt = availableEvents[0] || {
      id: 'evt_rock_rimmool_2026',
      title: 'Rock Rimmool Live Festival 2026',
      posterUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=80',
    };
    setFormSelectedEventId(firstEvt.id);
    setFormBannerImageUrl(firstEvt.posterUrl || '');
    setFormBannerLinkType('concert');
    setFormBannerCustomUrl('');
    setFormBannerOrder(bannersList.length + 1);
    setFormBannerIsActive(true);
    setFormBannerStartAt('');
    setFormBannerEndAt('');
    setIsBannerModalOpen(true);
  };

  // Open Edit Banner Modal
  const openEditBannerModal = (banner: HeroBannerItem) => {
    setEditingBannerId(banner.id);
    setFormBannerType(banner.type);
    setFormSelectedEventId(banner.eventId || (availableEvents[0]?.id || ''));
    setFormBannerImageUrl(banner.imageUrl);
    setFormBannerLinkType(banner.linkType);
    setFormBannerCustomUrl(banner.customUrl || '');
    setFormBannerOrder(banner.order);
    setFormBannerIsActive(banner.isActive);
    setFormBannerStartAt(banner.startAt ? banner.startAt.slice(0, 16) : '');
    setFormBannerEndAt(banner.endAt ? banner.endAt.slice(0, 16) : '');
    setIsBannerModalOpen(true);
  };

  // Handle Event selection change in Featured mode
  const handleSelectEvent = (eventId: string) => {
    setFormSelectedEventId(eventId);
    const evt = availableEvents.find(e => e.id === eventId);
    if (evt?.posterUrl) {
      setFormBannerImageUrl(evt.posterUrl);
    }
  };

  // Save Banner (Create or Edit)
  const handleSaveBanner = (e: React.FormEvent) => {
    e.preventDefault();

    const linkedEvent = formBannerType === 'featured_concert' || formBannerLinkType === 'concert'
      ? availableEvents.find(e => e.id === formSelectedEventId)
      : undefined;

    const finalImageUrl = (formBannerType === 'featured_concert' ? linkedEvent?.posterUrl : formBannerImageUrl.trim()) || formBannerImageUrl.trim();
    if (!finalImageUrl) {
      triggerToast('error', 'กรุณาระบุ URL รูปภาพแบนเนอร์ หรือเลือกคอนเสิร์ตที่มีภาพโปสเตอร์');
      return;
    }

    const titleRef = formBannerType === 'featured_concert'
      ? (linkedEvent?.title || 'คอนเสิร์ตเด่น')
      : (linkedEvent?.title || (formBannerLinkType === 'custom_url' ? formBannerCustomUrl.trim() : 'แบนเนอร์กำหนดเอง'));

    let updatedList: HeroBannerItem[];

    if (editingBannerId) {
      updatedList = bannersList.map(item => {
        if (item.id === editingBannerId) {
          return {
            ...item,
            type: formBannerType,
            title: titleRef,
            imageUrl: finalImageUrl,
            linkType: formBannerType === 'featured_concert' ? 'concert' : formBannerLinkType,
            eventId: (formBannerType === 'featured_concert' || formBannerLinkType === 'concert') ? formSelectedEventId : undefined,
            eventTitle: linkedEvent?.title,
            customUrl: formBannerLinkType === 'custom_url' ? formBannerCustomUrl.trim() : undefined,
            order: Number(formBannerOrder) || item.order,
            isActive: formBannerIsActive,
            startAt: formBannerStartAt ? new Date(formBannerStartAt).toISOString() : null,
            endAt: formBannerEndAt ? new Date(formBannerEndAt).toISOString() : null,
            updatedAt: new Date().toISOString(),
          };
        }
        return item;
      });
      triggerToast('success', 'บันทึกการแก้ไขข้อมูลแบนเนอร์เรียบร้อยแล้ว');
    } else {
      const newBanner: HeroBannerItem = {
        id: `banner-${Date.now()}`,
        type: formBannerType,
        title: titleRef,
        imageUrl: finalImageUrl,
        linkType: formBannerType === 'featured_concert' ? 'concert' : formBannerLinkType,
        eventId: (formBannerType === 'featured_concert' || formBannerLinkType === 'concert') ? formSelectedEventId : undefined,
        eventTitle: linkedEvent?.title,
        customUrl: formBannerLinkType === 'custom_url' ? formBannerCustomUrl.trim() : undefined,
        order: Number(formBannerOrder) || (bannersList.length + 1),
        isActive: formBannerIsActive,
        startAt: formBannerStartAt ? new Date(formBannerStartAt).toISOString() : null,
        endAt: formBannerEndAt ? new Date(formBannerEndAt).toISOString() : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      updatedList = [...bannersList, newBanner];
      triggerToast('success', 'สร้างแบนเนอร์หน้าแรกใหม่เรียบร้อยแล้ว');
    }

    // Sort by order and reassign sequence 1..N
    const normalized = updatedList
      .sort((a, b) => a.order - b.order)
      .map((b, idx) => ({ ...b, order: idx + 1 }));

    setBannersList(normalized);
    saveHomeBanners(normalized);
    setIsBannerModalOpen(false);
  };

  // Toggle Banner Status
  const handleToggleBannerStatus = (id: string) => {
    const updated = bannersList.map(b => (b.id === id ? { ...b, isActive: !b.isActive, updatedAt: new Date().toISOString() } : b));
    setBannersList(updated);
    saveHomeBanners(updated);
    const target = updated.find(b => b.id === id);
    triggerToast('success', target?.isActive ? 'เปิดใช้งานแบนเนอร์แล้ว' : 'ปิดใช้งานแบนเนอร์แล้ว');
  };

  // Move Banner Up / Down
  const handleMoveBanner = (id: string, direction: 'up' | 'down') => {
    const index = bannersList.findIndex(b => b.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === bannersList.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...bannersList];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    const normalized = reordered.map((b, idx) => ({ ...b, order: idx + 1 }));
    setBannersList(normalized);
    saveHomeBanners(normalized);
    triggerToast('success', 'ปรับเปลี่ยนลำดับการแสดงผลแบนเนอร์เรียบร้อยแล้ว');
  };

  // Delete Banner
  const handleDeleteBanner = (id: string) => {
    const target = bannersList.find(b => b.id === id);
    if (!target) return;
    if (confirm(`คุณต้องการลบแบนเนอร์ "${target.title}" หรือไม่?`)) {
      const remaining = bannersList
        .filter(b => b.id !== id)
        .map((b, idx) => ({ ...b, order: idx + 1 }));
      setBannersList(remaining);
      saveHomeBanners(remaining);
      triggerToast('success', 'ลบแบนเนอร์เรียบร้อยแล้ว');
    }
  };

  // Reset Banners
  const handleResetBanners = () => {
    if (confirm('คุณต้องการรีเซ็ตแบนเนอร์หน้าแรกกลับเป็นค่าเริ่มต้นของระบบหรือไม่?')) {
      const resetList = resetHomeBanners();
      setBannersList(resetList);
      triggerToast('success', 'รีเซ็ตแบนเนอร์หน้าแรกกลับเป็นค่าเริ่มต้นเรียบร้อยแล้ว');
    }
  };

  // Filtered Banners
  const filteredBanners = bannersList.filter(b => {
    if (bannerStatusFilter === 'active' && !b.isActive) return false;
    if (bannerStatusFilter === 'inactive' && b.isActive) return false;
    if (bannerTypeFilter !== 'all' && b.type !== bannerTypeFilter) return false;
    if (bannerSearchQuery.trim()) {
      const q = bannerSearchQuery.toLowerCase();
      const matchTitle = (b.title || '').toLowerCase().includes(q);
      const matchEvt = b.eventTitle?.toLowerCase().includes(q) || false;
      if (!matchTitle && !matchEvt) return false;
    }
    return true;
  });

  const activeBannersCount = bannersList.filter(b => b.isActive).length;

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
            aria-selected={activeTab === 'banners'}
            className={`hub-filter-tab ${activeTab === 'banners' ? 'active' : ''}`}
            onClick={() => setActiveTab('banners')}
            data-testid="tab-banners"
            title="จัดการแบนเนอร์หน้าแรก (Hero Banners)"
          >
            <span>แบนเนอร์หน้าแรก</span>
            <span className="hub-tab-count-badge">{bannersList.length}</span>
            {activeBannersCount > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#10b981',
                  color: '#ffffff',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  borderRadius: '9999px',
                  padding: '0.1rem 0.45rem',
                  marginLeft: '0.25rem',
                }}
              >
                เปิดใช้ {activeBannersCount}
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

        {/* Right Tools (Toolbar for Banners Tab) */}
        {activeTab === 'banners' && (
          <div className="hub-toolbar-tools-right">
            {/* Live Search Input */}
            <div className="hub-search-box">
              <SearchIcon className="hub-search-icon" />
              <input
                type="text"
                placeholder="ค้นหาชื่อแบนเนอร์, คอนเสิร์ต..."
                value={bannerSearchQuery}
                onChange={e => setBannerSearchQuery(e.target.value)}
                className="hub-search-input"
                aria-label="ช่องค้นหาแบนเนอร์"
              />
              {bannerSearchQuery && (
                <button
                  type="button"
                  className="hub-search-clear-btn"
                  onClick={() => setBannerSearchQuery('')}
                  title="ล้างคำค้นหา"
                  aria-label="ล้างคำค้นหา"
                >
                  <XIcon />
                </button>
              )}
            </div>

            {/* Type Filter Select */}
            <select
              value={bannerTypeFilter}
              onChange={e => setBannerTypeFilter(e.target.value as 'all' | 'featured_concert' | 'custom')}
              className="hub-filter-select"
              aria-label="ตัวกรองประเภทแบนเนอร์"
            >
              <option value="all">ประเภท: ทั้งหมด</option>
              <option value="featured_concert">ดึงจากคอนเสิร์ต</option>
              <option value="custom">แบนเนอร์กำหนดเอง</option>
            </select>

            {/* Status Filter Select */}
            <select
              value={bannerStatusFilter}
              onChange={e => setBannerStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="hub-filter-select"
              aria-label="ตัวกรองสถานะแบนเนอร์"
            >
              <option value="all">สถานะ: ทั้งหมด</option>
              <option value="active">เปิดใช้งาน ({activeBannersCount})</option>
              <option value="inactive">ปิดใช้งาน ({bannersList.length - activeBannersCount})</option>
            </select>

            {/* Reset Button */}
            <button
              type="button"
              className="secondary-button"
              onClick={handleResetBanners}
              title="รีเซ็ตแบนเนอร์เป็นค่าเริ่มต้น"
              style={{
                height: '38px',
                minHeight: '38px',
                fontSize: '0.825rem',
                padding: '0 0.75rem',
                whiteSpace: 'nowrap',
              }}
            >
              รีเซ็ตค่าเริ่มต้น
            </button>

            {/* Primary Action Button: Add Banner */}
            <button
              type="button"
              className="primary-button"
              onClick={openCreateBannerModal}
              data-testid="open-create-banner-modal-btn"
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
              <PlusIcon style={{ width: '15px', height: '15px' }} />
              <span>+ เพิ่มแบนเนอร์ใหม่</span>
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
          TAB 2: แบนเนอร์หน้าแรก (Hero Banners Management, Q1A, Q2A, Q3A, Q4A)
          ========================================================================== */}
      {activeTab === 'banners' && (
        <section className="hub-banner-container" aria-label="จัดการแบนเนอร์หน้าแรก">
          {/* Info Banner Note */}
          <div className="hub-banner-info-banner">
            <CheckCircleIcon style={{ width: '20px', height: '20px', color: '#2563eb', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>ระบบจัดการแบนเนอร์ภาพเด่นหน้าแรก (Hero Banners Management)</strong>
              <p style={{ marginTop: '0.2rem', color: '#475569' }}>
                กำหนดคอนเสิร์ตเด่นที่จะแสดงบนแถบแบนเนอร์ด้านบนสุดของหน้าแรก หรืออัปโหลดภาพแบนเนอร์เฉพาะพร้อมเชื่อมโยงลิงก์ได้อย่างอิสระ
                คุณสามารถจัดลำดับการแสดงผล และเปิด-ปิดสถานะได้ทันที
              </p>
            </div>
          </div>

          {/* Banners List */}
          <div className="hub-banner-list">
            {filteredBanners.length === 0 ? (
              <div className="hub-empty-state-card">
                <CheckCircleIcon className="empty-state-icon" />
                <p className="empty-title">ไม่พบรายการแบนเนอร์ที่ตรงกับเงื่อนไข</p>
                <p className="empty-desc">ลองเปลี่ยนคำค้นหา หรือกดปุ่ม &quot;+ เพิ่มแบนเนอร์ใหม่&quot; เพื่อสร้างแบนเนอร์แรก</p>
              </div>
            ) : (
              filteredBanners.map((banner, index) => {
                const isCurrentlyActive = isBannerScheduleActive(banner);
                let scheduleText = 'แสดงตลอดเวลา (ไม่มีกำหนดสิ้นสุด)';
                if (banner.startAt || banner.endAt) {
                  const startStr = banner.startAt ? formatDate(new Date(banner.startAt)) : 'ตอนนี้';
                  const endStr = banner.endAt ? formatDate(new Date(banner.endAt)) : 'ไม่มีกำหนด';
                  scheduleText = `ช่วงเวลา: ${startStr} - ${endStr}`;
                }

                return (
                  <div
                    key={banner.id}
                    className={`hub-banner-card ${!banner.isActive ? 'is-inactive' : ''}`}
                    data-testid={`banner-card-${banner.id}`}
                  >
                    <div className="hub-banner-card-left">
                      {/* Order sequence & Up/Down buttons */}
                      <div className="hub-banner-order-box">
                        <span className="hub-banner-order-num">#{banner.order}</span>
                        <div className="hub-banner-order-btns">
                          <button
                            type="button"
                            className="hub-banner-order-btn"
                            onClick={() => handleMoveBanner(banner.id, 'up')}
                            disabled={index === 0}
                            title="เลื่อนขึ้นก่อนหน้า"
                            aria-label="เลื่อนขึ้นก่อนหน้า"
                          >
                            <ChevronUpIcon style={{ width: '12px', height: '12px' }} />
                          </button>
                          <button
                            type="button"
                            className="hub-banner-order-btn"
                            onClick={() => handleMoveBanner(banner.id, 'down')}
                            disabled={index === bannersList.length - 1}
                            title="เลื่อนลงถัดไป"
                            aria-label="เลื่อนลงถัดไป"
                          >
                            <ChevronDownIcon style={{ width: '12px', height: '12px' }} />
                          </button>
                        </div>
                      </div>

                      {/* 21:9 Aspect Thumbnail */}
                      <div className="hub-banner-thumbnail">
                        {banner.imageUrl ? (
                          /* biome-ignore lint/performance/noImgElement: banner thumbnail */
                          <img src={banner.imageUrl} alt={banner.title} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', background: '#1e293b' }} />
                        )}
                      </div>

                      {/* Metadata & Details */}
                      <div className="hub-banner-info">
                        <div className="hub-banner-title-row">
                          <h4 className="hub-banner-title">{banner.title}</h4>
                          <span
                            className={`hub-banner-type-badge ${banner.type === 'featured_concert' ? 'concert' : 'custom'}`}
                          >
                            {banner.type === 'featured_concert' ? 'ดึงจากคอนเสิร์ต' : 'แบนเนอร์กำหนดเอง'}
                          </span>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              padding: '0.15rem 0.45rem',
                              borderRadius: '9999px',
                              background: '#f1f5f9',
                              color: '#475569',
                            }}
                          >
                            {banner.linkType === 'concert'
                              ? (banner.eventTitle ? `ลิงก์คอนเสิร์ต: ${banner.eventTitle}` : 'ลิงก์คอนเสิร์ต')
                              : banner.linkType === 'custom_url'
                              ? `ลิงก์ URL: ${banner.customUrl}`
                              : 'ไม่มีลิงก์ (Graphic Only)'}
                          </span>
                        </div>

                        <div className="hub-banner-meta-row">
                          <span className="hub-banner-meta-item">
                            <ClockIcon style={{ width: '12px', height: '12px' }} />
                            <span>{scheduleText}</span>
                          </span>
                          {!isCurrentlyActive && banner.isActive && (
                            <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                              (อยู่นอกช่วงเวลาแสดงผล)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right controls: Active switch & Actions */}
                    <div className="hub-banner-card-right">
                      <div className="hub-banner-toggle-wrapper">
                        <span>{banner.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span>
                        <div
                          className={`hub-banner-switch ${banner.isActive ? 'is-active' : ''}`}
                          onClick={() => handleToggleBannerStatus(banner.id)}
                          role="switch"
                          aria-checked={banner.isActive}
                          tabIndex={0}
                          onKeyDown={e => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              handleToggleBannerStatus(banner.id);
                            }
                          }}
                        >
                          <div className="hub-banner-switch-handle" />
                        </div>
                      </div>

                      <div className="hub-banner-actions-group">
                        <button
                          type="button"
                          className="hub-banner-action-btn"
                          onClick={() => openEditBannerModal(banner)}
                          title="แก้ไขข้อมูลแบนเนอร์"
                        >
                          <PencilSquareIcon style={{ width: '14px', height: '14px' }} />
                          <span>แก้ไข</span>
                        </button>
                        <button
                          type="button"
                          className="hub-banner-action-btn danger"
                          onClick={() => handleDeleteBanner(banner.id)}
                          title="ลบแบนเนอร์"
                        >
                          <TrashIcon style={{ width: '14px', height: '14px' }} />
                          <span>ลบ</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* ==========================================================================
          TAB 3: ข้อมูลติดต่อแอดมิน (Contact Channels & Live Preview, Q4 -> A4)
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

      {/* ==========================================================================
          MODAL 3: Create / Edit Hero Banner (Q1A, Q3A, Q4A)
          ========================================================================== */}
      {isBannerModalOpen && (
        /* biome-ignore lint/a11y/useKeyWithClickEvents: Backdrop click dismiss */
        <div
          className="review-modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget) setIsBannerModalOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={bannerModalTitleId}
        >
          <div
            className="dialog-modal-card"
            style={{ maxWidth: '640px' }}
          >
            {/* Modal Header */}
            <div className="dialog-modal-header">
              <div className="dialog-modal-title-row">
                <PlusIcon className="modal-title-icon" />
                <h3 id={bannerModalTitleId} className="dialog-modal-title">
                  {editingBannerId ? 'แก้ไขข้อมูลแบนเนอร์หน้าแรก' : 'เพิ่มแบนเนอร์หน้าแรกใหม่'}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={() => setIsBannerModalOpen(false)}
                aria-label="ปิดหน้าต่าง"
              >
                <XIcon />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveBanner} className="dialog-modal-body">
              {/* Type Selection (Q1A, Q2A) */}
              <div className="banner-modal-type-selector">
                <button
                  type="button"
                  className={`banner-type-card-btn ${formBannerType === 'featured_concert' ? 'selected' : ''}`}
                  onClick={() => {
                    setFormBannerType('featured_concert');
                    setFormBannerLinkType('concert');
                    if (formSelectedEventId) {
                      handleSelectEvent(formSelectedEventId);
                    }
                  }}
                >
                  <span className="banner-type-card-title">1. ดึงจากคอนเสิร์ต (Featured)</span>
                  <span className="banner-type-card-desc">
                    เลือกคอนเสิร์ตในระบบ ดึงภาพโปสเตอร์/ปกมาแสดง และผูกลิงก์ไปหน้าจองบัตรอัตโนมัติ
                  </span>
                </button>

                <button
                  type="button"
                  className={`banner-type-card-btn ${formBannerType === 'custom' ? 'selected' : ''}`}
                  onClick={() => {
                    setFormBannerType('custom');
                  }}
                >
                  <span className="banner-type-card-title">2. ระบุรูปภาพเอง (Custom Image)</span>
                  <span className="banner-type-card-desc">
                    ใส่ URL รูปภาพแบนเนอร์แนวนอน (21:9) และเลือกลิงก์ปลายทางได้อย่างอิสระ
                  </span>
                </button>
              </div>

              {/* Mode 1: Event Selector */}
              {formBannerType === 'featured_concert' && (
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label htmlFor="banner-select-event" className="form-label" style={{ fontWeight: 600 }}>
                    เลือกคอนเสิร์ตในระบบ:
                  </label>
                  <select
                    id="banner-select-event"
                    className="select-input"
                    value={formSelectedEventId}
                    onChange={e => handleSelectEvent(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {availableEvents.map(evt => (
                      <option key={evt.id} value={evt.id}>
                        {evt.title} {evt.location ? `(${evt.location})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Mode 2: Custom Image URL Input */}
              {formBannerType === 'custom' && (
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label htmlFor="banner-image-url" className="form-label" style={{ fontWeight: 600 }}>
                    URL รูปภาพแบนเนอร์ (อัตราส่วน 21:9 แนวนอน) *
                  </label>
                  <input
                    id="banner-image-url"
                    type="text"
                    className="text-input"
                    value={formBannerImageUrl}
                    onChange={e => setFormBannerImageUrl(e.target.value)}
                    placeholder="https://..."
                    required
                    style={{ width: '100%' }}
                  />
                </div>
              )}

              {/* Live Preview Box: Pure Panoramic Graphic (Q1A) */}
              {formBannerImageUrl && (
                <div style={{ marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>
                    พรีวิวภาพแบนเนอร์หน้าแรก (ไม่มีข้อความหรือปุ่มทับบนภาพ):
                  </span>
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '21 / 9',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      position: 'relative',
                      background: '#0f172a',
                      border: '1px solid #cbd5e1',
                    }}
                  >
                    {/* biome-ignore lint/performance/noImgElement: banner live preview */}
                    <img
                      src={formBannerImageUrl}
                      alt="พรีวิวแบนเนอร์"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      onError={e => {
                        (e.currentTarget as HTMLImageElement).src =
                          'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=80';
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Destination Link Settings for Custom Banner (Q3A) */}
              {formBannerType === 'custom' && (
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label htmlFor="banner-link-type" className="form-label" style={{ fontWeight: 600 }}>
                    จุดเชื่อมโยงเมื่อคลิกที่รูปภาพ:
                  </label>
                  <select
                    id="banner-link-type"
                    className="select-input"
                    value={formBannerLinkType}
                    onChange={e => setFormBannerLinkType(e.target.value as BannerLinkType)}
                    style={{ width: '100%' }}
                  >
                    <option value="concert">ลิงก์ไปหน้าคอนเสิร์ต</option>
                    <option value="custom_url">ลิงก์ URL กำหนดเอง</option>
                    <option value="none">ไม่ระบุลิงก์ (แสดงภาพอย่างเดียว คลิกไม่ได้)</option>
                  </select>
                </div>
              )}

              {formBannerType === 'custom' && formBannerLinkType === 'custom_url' && (
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label htmlFor="banner-custom-url" className="form-label" style={{ fontWeight: 600 }}>
                    URL ปลายทางที่ต้องการลิงก์ไป:
                  </label>
                  <input
                    id="banner-custom-url"
                    type="text"
                    className="text-input"
                    value={formBannerCustomUrl}
                    onChange={e => setFormBannerCustomUrl(e.target.value)}
                    placeholder="เช่น /news/news-sys-01 หรือ https://..."
                    required
                    style={{ width: '100%' }}
                  />
                </div>
              )}

              {formBannerType === 'custom' && formBannerLinkType === 'concert' && (
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label htmlFor="banner-custom-event" className="form-label" style={{ fontWeight: 600 }}>
                    เลือกคอนเสิร์ตปลายทาง:
                  </label>
                  <select
                    id="banner-custom-event"
                    className="select-input"
                    value={formSelectedEventId}
                    onChange={e => setFormSelectedEventId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {availableEvents.map(evt => (
                      <option key={evt.id} value={evt.id}>
                        {evt.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Display Order & Active Settings (Q4A) */}
              <div className="banner-form-row-2" style={{ marginBottom: '1rem' }}>
                <div className="form-group">
                  <label htmlFor="banner-order" className="form-label" style={{ fontWeight: 600 }}>
                    ลำดับการแสดงผล (Order):
                  </label>
                  <input
                    id="banner-order"
                    type="number"
                    min={1}
                    className="text-input"
                    value={formBannerOrder}
                    onChange={e => setFormBannerOrder(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>

                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', paddingBottom: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={formBannerIsActive}
                      onChange={e => setFormBannerIsActive(e.target.checked)}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>
                      เปิดใช้งานแบนเนอร์นี้ทันที
                    </span>
                  </label>
                </div>
              </div>

              {/* Optional Schedule (Q4A) */}
              <div className="banner-form-row-2" style={{ marginBottom: '1.25rem' }}>
                <div className="form-group">
                  <label htmlFor="banner-start-at" className="form-label" style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    เริ่มแสดงผล (เว้นว่างหากแสดงทันที):
                  </label>
                  <input
                    id="banner-start-at"
                    type="datetime-local"
                    className="text-input"
                    value={formBannerStartAt}
                    onChange={e => setFormBannerStartAt(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="banner-end-at" className="form-label" style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    สิ้นสุดการแสดงผล (เว้นว่างหากไม่มีกำหนด):
                  </label>
                  <input
                    id="banner-end-at"
                    type="datetime-local"
                    className="text-input"
                    value={formBannerEndAt}
                    onChange={e => setFormBannerEndAt(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="dialog-modal-footer">
                <button
                  type="button"
                  className="secondary-button modal-footer-btn"
                  onClick={() => setIsBannerModalOpen(false)}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="primary-button modal-footer-btn"
                  data-testid="save-banner-submit-btn"
                >
                  <CheckIcon style={{ width: '14px', height: '14px' }} />
                  <span>{editingBannerId ? 'บันทึกการแก้ไข' : 'สร้างแบนเนอร์'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
