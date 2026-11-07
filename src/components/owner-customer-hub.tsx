'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { PaidOrderForCorrection, OrderContactAuditRecord, OrderContactAuditWithDetails } from '@/server/contact-correction';
import type { TicketEmailDeliveryRecord } from '@/server/ticket-delivery';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import { SearchIcon, RefreshIcon, XIcon, CheckCircleIcon, MailIcon, UsersIcon } from './icons';
import { triggerToast } from './toast-notification';

type CustomerHubTab = 'orders' | 'audits' | 'emails';
type EditStatusFilter = 'all' | 'edited' | 'unmodified';

const toDate = (val?: string | Date) => (val ? new Date(val) : new Date());

export const SAMPLE_MOCK_PAID_ORDERS: PaidOrderForCorrection[] = [
  {
    id: 'ORD-20261105-0891',
    eventId: 'mock-event-ubu-freshy',
    eventTitle: 'เทศกาลดนตรีต้อนรับน้องใหม่ UBU Freshy Fest 2026',
    sessionId: 'sess-ubu-01',
    sessionStartTime: '2026-11-21T01:00:00.000Z',
    buyerName: 'คุณกิตติศักดิ์ เจริญผล',
    buyerEmail: 'kittisak.c@ubu.ac.th',
    buyerPhone: '0897654321',
    status: 'paid',
    subtotal: 1800,
    customerFee: 54,
    total: 1854,
    ticketCount: 2,
    auditCount: 1,
    createdAt: '2026-11-05T08:30:00.000Z',
    updatedAt: '2026-11-05T09:15:00.000Z',
  },
  {
    id: 'ORD-20261104-0742',
    eventId: 'mock-event-rock-rimmool',
    eventTitle: 'Rock Rimmool Live Festival 2026',
    sessionId: 'sess-rock-01',
    sessionStartTime: '2026-12-06T00:00:00.000Z',
    buyerName: 'คุณวิภาวรรณ สดใส',
    buyerEmail: 'wipawan.s@gmail.com',
    buyerPhone: '0812345678',
    status: 'paid',
    subtotal: 2400,
    customerFee: 72,
    total: 2472,
    ticketCount: 3,
    auditCount: 0,
    createdAt: '2026-11-04T14:20:00.000Z',
    updatedAt: '2026-11-04T14:20:00.000Z',
  },
  {
    id: 'ORD-20261103-0511',
    eventId: 'mock-event-isan-folk',
    eventTitle: 'Isan Folk & Acoustic Night 2026',
    sessionId: 'sess-folk-01',
    sessionStartTime: '2026-11-29T02:00:00.000Z',
    buyerName: 'คุณปรีชา พัฒนากุล',
    buyerEmail: 'preecha.p@outlook.com',
    buyerPhone: '0869998877',
    status: 'paid',
    subtotal: 900,
    customerFee: 27,
    total: 927,
    ticketCount: 1,
    auditCount: 0,
    createdAt: '2026-11-03T11:10:00.000Z',
    updatedAt: '2026-11-03T11:10:00.000Z',
  },
];

export const SAMPLE_MOCK_AUDIT_LOGS: OrderContactAuditWithDetails[] = [
  {
    id: 'AUD-20261105-001',
    orderId: 'ORD-20261105-0891',
    correctedByUserId: 'usr-admin-01',
    correctedByName: 'เจ้าของเว็บทดสอบ (Admin)',
    previousEmail: 'kittisak.old@gmail.com',
    previousPhone: '0897650000',
    newEmail: 'kittisak.c@ubu.ac.th',
    newPhone: '0897654321',
    reason: 'ผู้ซื้อติดต่อขอย้ายอีเมลแจ้งเตือนมายังอีเมลสถาบันเพื่อรับสิทธิ์ UBU พร้อมยืนยันบัตรนักศึกษาเรียบร้อย',
    buyerName: 'คุณกิตติศักดิ์ เจริญผล',
    eventTitle: 'เทศกาลดนตรีต้อนรับน้องใหม่ UBU Freshy Fest 2026',
    createdAt: '2026-11-05T09:15:00.000Z',
  },
];

export const SAMPLE_MOCK_DELIVERIES: TicketEmailDeliveryRecord[] = [
  {
    id: 'DEL-20261105-004',
    orderId: 'ORD-20261104-0742',
    recipientEmail: 'wipawan.s.invalid@test-domain-fail.com',
    status: 'failed',
    error: 'SMTP 550 5.1.1 Recipient address rejected: User unknown in virtual mailbox table',
    retryCount: 2,
    createdAt: '2026-11-04T14:22:00.000Z',
    updatedAt: '2026-11-04T15:00:00.000Z',
  },
];

/**
 * Modernized Customer & Orders Management Hub (D-250)
 * Flat canvas, 3 underline tabs, balanced toolbar with dual filters,
 * standard 38px buttons, modal popups for contact correction, and audit history.
 * Zero Emojis (D-14) 100% compliant.
 */
export function OwnerCustomerHub() {
  const [activeTab, setActiveTab] = useState<CustomerHubTab>('orders');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  const [selectedEditStatus, setSelectedEditStatus] = useState<EditStatusFilter>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Data states
  const [orders, setOrders] = useState<PaidOrderForCorrection[]>([]);
  const [audits, setAudits] = useState<OrderContactAuditWithDetails[]>([]);
  const [deliveries, setDeliveries] = useState<TicketEmailDeliveryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Modal states
  const [editingOrder, setEditingOrder] = useState<PaidOrderForCorrection | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const [viewingAuditOrder, setViewingAuditOrder] = useState<PaidOrderForCorrection | null>(null);
  const [orderAuditLogs, setOrderAuditLogs] = useState<OrderContactAuditRecord[]>([]);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);

  const [viewingOrderDetails, setViewingOrderDetails] = useState<PaidOrderForCorrection | null>(null);

  // Filter setters that reset page to 1
  const handleSelectTab = (tab: CustomerHubTab) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handleSelectEvent = (id: string) => {
    setSelectedEventId(id);
    setCurrentPage(1);
  };

  const handleSelectStatus = (status: EditStatusFilter) => {
    setSelectedEditStatus(status);
    setCurrentPage(1);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  // Fetch orders
  const fetchOrders = useCallback(async (query = '') => {
    setIsLoading(true);
    try {
      const url = query.trim()
        ? `/api/owner/orders/contact-correction?q=${encodeURIComponent(query.trim())}`
        : '/api/owner/orders/contact-correction';
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'ไม่สามารถดึงข้อมูลคำสั่งซื้อได้');
      }
      const data = await res.json();
      setOrders(data.orders || []);
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดคำสั่งซื้อ',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch audits
  const fetchAudits = useCallback(async () => {
    try {
      const res = await fetch('/api/owner/orders/contact-correction/audits');
      if (res.ok) {
        const data = await res.json();
        setAudits(data.audits || []);
      }
    } catch {
      // ignore
    }
  }, []);

  // Fetch email deliveries
  const fetchDeliveries = useCallback(async () => {
    try {
      const res = await fetch('/api/owner/failed-email-deliveries');
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.deliveries || []);
      }
    } catch {
      // ignore
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchOrders();
    fetchAudits();
    fetchDeliveries();
  }, [fetchOrders, fetchAudits, fetchDeliveries]);

  // Display datasets with mock fallbacks when API is empty (D-230, D-250)
  const displayOrders = useMemo(() => {
    return orders.length > 0 ? orders : SAMPLE_MOCK_PAID_ORDERS;
  }, [orders]);

  const displayAudits = useMemo(() => {
    return audits.length > 0 ? audits : SAMPLE_MOCK_AUDIT_LOGS;
  }, [audits]);

  const displayDeliveries = useMemo(() => {
    return deliveries.length > 0 ? deliveries : SAMPLE_MOCK_DELIVERIES;
  }, [deliveries]);

  // Unique events for dropdown filter
  const eventOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of displayOrders) {
      if (o.eventId && o.eventTitle) {
        map.set(o.eventId, o.eventTitle);
      }
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [displayOrders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return displayOrders.filter(o => {
      // Event filter
      if (selectedEventId !== 'all' && o.eventId !== selectedEventId) {
        return false;
      }
      // Edit status filter
      if (selectedEditStatus === 'edited' && (!o.auditCount || o.auditCount === 0)) {
        return false;
      }
      if (selectedEditStatus === 'unmodified' && (o.auditCount && o.auditCount > 0)) {
        return false;
      }
      // Query filter (in-memory refinement)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = o.id.toLowerCase().includes(q);
        const matchesName = o.buyerName.toLowerCase().includes(q);
        const matchesEmail = o.buyerEmail.toLowerCase().includes(q);
        const matchesPhone = o.buyerPhone.includes(q);
        const matchesEvent = o.eventTitle.toLowerCase().includes(q);
        return matchesId || matchesName || matchesEmail || matchesPhone || matchesEvent;
      }
      return true;
    });
  }, [displayOrders, selectedEventId, selectedEditStatus, searchQuery]);

  // Filtered audits
  const filteredAudits = useMemo(() => {
    if (!searchQuery.trim()) return displayAudits;
    const q = searchQuery.toLowerCase().trim();
    return displayAudits.filter(a =>
      a.orderId.toLowerCase().includes(q) ||
      (a.buyerName?.toLowerCase().includes(q)) ||
      (a.eventTitle?.toLowerCase().includes(q)) ||
      a.newEmail.toLowerCase().includes(q) ||
      a.newPhone.includes(q) ||
      a.correctedByName.toLowerCase().includes(q),
    );
  }, [displayAudits, searchQuery]);

  // Filtered deliveries
  const filteredDeliveries = useMemo(() => {
    if (!searchQuery.trim()) return displayDeliveries;
    const q = searchQuery.toLowerCase().trim();
    return displayDeliveries.filter(d =>
      d.orderId.toLowerCase().includes(q) ||
      d.recipientEmail.toLowerCase().includes(q) ||
      (d.error?.toLowerCase().includes(q)),
    );
  }, [displayDeliveries, searchQuery]);

  // Pagination slicing
  const totalOrdersPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage]);

  const totalAuditsPages = Math.ceil(filteredAudits.length / pageSize) || 1;
  const paginatedAudits = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAudits.slice(start, start + pageSize);
  }, [filteredAudits, currentPage]);

  // Handlers for Modals
  const handleOpenEditModal = (order: PaidOrderForCorrection) => {
    setEditingOrder(order);
    setNewEmail(order.buyerEmail);
    setNewPhone(order.buyerPhone);
    setReason('');
  };

  const handleCloseEditModal = () => {
    setEditingOrder(null);
    setNewEmail('');
    setNewPhone('');
    setReason('');
  };

  const handleSubmitEditModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;

    if (!newEmail.trim()) {
      triggerToast({ type: 'error', message: 'กรุณาระบุอีเมลใหม่' });
      return;
    }
    if (!newPhone.trim()) {
      triggerToast({ type: 'error', message: 'กรุณาระบุเบอร์โทรศัพท์ใหม่' });
      return;
    }
    if (!reason.trim()) {
      triggerToast({
        type: 'error',
        message: 'กรุณาระบุบันทึกเหตุผลการตรวจสอบตัวตนผู้ซื้อตามระเบียบ G-24',
      });
      return;
    }

    setIsSubmittingEdit(true);
    try {
      const res = await fetch(`/api/owner/orders/${editingOrder.id}/contact-correction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newEmail: newEmail.trim(),
          newPhone: newPhone.trim(),
          reason: reason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'ไม่สามารถแก้ไขข้อมูลติดต่อได้');
      }

      triggerToast({
        type: 'success',
        message: `แก้ไขข้อมูลติดต่อคำสั่งซื้อ #${editingOrder.id} สำเร็จเรียบร้อย (บันทึกประวัติรหัส ${data.auditLogId})`,
      });

      handleCloseEditModal();
      await fetchOrders(searchQuery);
      await fetchAudits();
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลติดต่อ',
      });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleOpenAuditModal = async (order: PaidOrderForCorrection) => {
    setViewingAuditOrder(order);
    setIsLoadingAuditLogs(true);
    try {
      const res = await fetch(`/api/owner/orders/${order.id}/contact-correction`);
      if (res.ok) {
        const data = await res.json();
        if (data.auditLogs && data.auditLogs.length > 0) {
          setOrderAuditLogs(data.auditLogs);
        } else if (order.id === 'ORD-20261105-0891') {
          setOrderAuditLogs(SAMPLE_MOCK_AUDIT_LOGS);
        } else {
          setOrderAuditLogs([]);
        }
      } else if (order.id === 'ORD-20261105-0891') {
        setOrderAuditLogs(SAMPLE_MOCK_AUDIT_LOGS);
      } else {
        setOrderAuditLogs([]);
      }
    } catch {
      setOrderAuditLogs(order.id === 'ORD-20261105-0891' ? SAMPLE_MOCK_AUDIT_LOGS : []);
    } finally {
      setIsLoadingAuditLogs(false);
    }
  };

  const handleCloseAuditModal = () => {
    setViewingAuditOrder(null);
    setOrderAuditLogs([]);
  };

  const handleRetryEmail = async (deliveryId: string) => {
    try {
      const res = await fetch('/api/owner/failed-email-deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'ลองส่งใหม่ไม่สำเร็จ');
      }
      triggerToast({
        type: 'success',
        message: `ส่งอีเมลสำหรับรายการ ${deliveryId} สำเร็จเรียบร้อยแล้ว`,
      });
      await fetchDeliveries();
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลองส่งใหม่',
      });
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await Promise.all([fetchOrders(searchQuery), fetchAudits(), fetchDeliveries()]);
    setIsLoading(false);
    triggerToast({
      type: 'info',
      message: 'อัปเดตข้อมูลลูกค้าและคำสั่งซื้อล่าสุดเรียบร้อยแล้ว',
      duration: 3000,
    });
  };

  return (
    <div className="owner-customer-management-hub" data-testid="owner-customer-management-hub">
      {/* Hub Title Header */}
      <div className="customer-hub-title-block">
        <h2 className="customer-hub-title">ลูกค้าและคำสั่งซื้อ (Customer & Order Management)</h2>
        <p className="customer-hub-subtitle">
          ตรวจสอบประวัติคำสั่งซื้อที่ชำระแล้ว แก้ไขข้อมูลติดต่อผู้ซื้อพร้อมบันทึกประวัติ (AC-76, G-24) และดูแลการจัดส่งอีเมลบัตร
        </p>
      </div>

      {/* Balanced Toolbar (D-250) */}
      <div className="hub-toolbar-row">
        {/* Left: 3 Underline Tabs (Q1 -> A2) */}
        <div className="hub-filter-tabs-bar" role="tablist" aria-label="แท็บระบบลูกค้าและคำสั่งซื้อ">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'orders'}
            className={`hub-filter-tab ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => handleSelectTab('orders')}
            data-testid="customer-tab-orders"
          >
            <UsersIcon className="tab-icon" />
            <span>คำสั่งซื้อทั้งหมด</span>
            <span className="hub-tab-count-badge">{displayOrders.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'audits'}
            className={`hub-filter-tab ${activeTab === 'audits' ? 'active' : ''}`}
            onClick={() => handleSelectTab('audits')}
            data-testid="customer-tab-audits"
          >
            <span>ประวัติการแก้ไขข้อมูล</span>
            <span className="hub-tab-count-badge">{displayAudits.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'emails'}
            className={`hub-filter-tab ${activeTab === 'emails' ? 'active' : ''}`}
            onClick={() => handleSelectTab('emails')}
            data-testid="customer-tab-emails"
          >
            <MailIcon className="tab-icon" />
            <span>ปัญหาการส่งอีเมลบัตร</span>
            <span className={`hub-tab-count-badge ${displayDeliveries.length > 0 ? 'badge-alert' : ''}`}>
              {displayDeliveries.length}
            </span>
          </button>
        </div>

        {/* Right: Search + Dual Dropdown Filters + Refresh (Q2 -> B1) */}
        <div className="hub-toolbar-tools-right">
          {/* Live Search Box */}
          <div className="hub-search-box">
            <SearchIcon className="hub-search-icon" />
            <input
              type="text"
              placeholder={
                activeTab === 'orders'
                  ? 'ค้นหารหัส, ชื่อ, อีเมล, เบอร์โทร...'
                  : activeTab === 'audits'
                    ? 'ค้นหาในประวัติการแก้ไข...'
                    : 'ค้นหารายการอีเมลที่ล้มเหลว...'
              }
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              className="hub-search-input"
              data-testid="customer-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="hub-search-clear"
                onClick={() => handleSearchChange('')}
                aria-label="ล้างคำค้นหา"
              >
                <XIcon />
              </button>
            )}
          </div>

          {/* Filter 1: Concert dropdown */}
          {activeTab === 'orders' && (
            <select
              value={selectedEventId}
              onChange={e => handleSelectEvent(e.target.value)}
              className="hub-sort-select"
              aria-label="กรองตามคอนเสิร์ต"
              data-testid="customer-filter-event"
            >
              <option value="all">ทุกคอนเสิร์ต ({eventOptions.length})</option>
              {eventOptions.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
          )}

          {/* Filter 2: Edit Status dropdown */}
          {activeTab === 'orders' && (
            <select
              value={selectedEditStatus}
              onChange={e => handleSelectStatus(e.target.value as EditStatusFilter)}
              className="hub-sort-select"
              aria-label="กรองตามสถานะการแก้ไข"
              data-testid="customer-filter-status"
            >
              <option value="all">การแก้ไข: ทั้งหมด</option>
              <option value="edited">เคยแก้ไขข้อมูลแล้ว</option>
              <option value="unmodified">ยังไม่เคยแก้ไข</option>
            </select>
          )}

          {/* Refresh button */}
          <button
            type="button"
            className="hub-refresh-btn"
            onClick={handleRefresh}
            disabled={isLoading}
            aria-label="รีเฟรชข้อมูล"
            title="รีเฟรชข้อมูล"
            data-testid="customer-refresh-btn"
          >
            <RefreshIcon className={`hub-refresh-icon ${isLoading ? 'spinning' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tab 1: Orders Tab */}
      {activeTab === 'orders' && (
        <section className="customer-orders-tab-content" aria-label="รายการคำสั่งซื้อ">
          {paginatedOrders.length === 0 ? (
            <div className="hub-empty-state-card">
              <p className="empty-title">ไม่พบรายการคำสั่งซื้อที่ตรงกับเงื่อนไข</p>
              <p className="empty-desc">ลองตรวจสอบคำค้นหา หรือเปลี่ยนตัวกรองคอนเสิร์ตและสถานะการแก้ไข</p>
            </div>
          ) : (
            <div className="customer-cards-stack">
              {paginatedOrders.map(order => {
                const hasBeenEdited = order.auditCount && order.auditCount > 0;
                return (
                  <article
                    key={order.id}
                    className="concert-horizontal-row-card customer-order-card"
                    data-testid={`order-card-${order.id}`}
                  >
                    {/* Left Center: Order details (4 rows) */}
                    <div className="row-card-center">
                      {/* Row 1: Badges & Order ID & Timestamp */}
                      <div className="row-card-badge-row">
                        <span className="row-detail-pill payout-pill">ชำระเงินแล้ว</span>
                        <strong className="order-code-badge" title="รหัสคำสั่งซื้อ">
                          #{order.id}
                        </strong>
                        {hasBeenEdited ? (
                          <span className="row-detail-pill amendment-pill">
                            เคยแก้ไขข้อมูล ({order.auditCount} ครั้ง)
                          </span>
                        ) : (
                          <span className="row-detail-pill">ข้อมูลเดิม</span>
                        )}
                        <span className="row-meta-dot" aria-hidden="true">·</span>
                        <span className="row-meta-item">
                          สั่งซื้อเมื่อ: {formatDate(toDate(order.createdAt))} {formatTime(toDate(order.createdAt))}
                        </span>
                      </div>

                      {/* Row 2: Customer Buyer Name & Contact info */}
                      <div className="customer-buyer-headline">
                        <h3 className="row-event-title customer-name-title">{order.buyerName}</h3>
                        <div className="customer-contact-tags">
                          <span className="contact-tag-item">
                            อีเมล: <strong>{order.buyerEmail}</strong>
                          </span>
                          <span className="row-meta-dot" aria-hidden="true">·</span>
                          <span className="contact-tag-item">
                            เบอร์โทร: <strong>{order.buyerPhone}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Row 3: Concert Name & Session Time */}
                      <div className="row-meta-strip">
                        <span className="row-meta-item">
                          คอนเสิร์ต: <strong>{order.eventTitle}</strong>
                        </span>
                        <span className="row-meta-dot" aria-hidden="true">·</span>
                        <span className="row-meta-item">
                          รอบแสดง: {formatDate(toDate(order.sessionStartTime))} {formatTime(toDate(order.sessionStartTime))}
                        </span>
                      </div>

                      {/* Row 4: Ticket Count & Price Breakdown */}
                      <div className="row-tags-strip">
                        <span className="row-detail-pill">จำนวนบัตร: {order.ticketCount} ใบ</span>
                        <span className="row-detail-pill">ยอดบัตร: {formatBaht(order.subtotal)} บาท</span>
                        <span className="row-detail-pill">ค่าบริการระบบ 3%: {formatBaht(order.customerFee)} บาท</span>
                        <span className="row-detail-pill total-pill">
                          ยอดรวมสุทธิ: <strong>{formatBaht(order.total)} บาท</strong>
                        </span>
                      </div>
                    </div>

                    {/* Right Action Column: Fixed 240px with Vertical Divider (D-246, D-250) */}
                    <div className="row-card-right">
                      <button
                        type="button"
                        className="primary-button row-action-btn"
                        onClick={() => handleOpenEditModal(order)}
                        data-testid={`edit-contact-btn-${order.id}`}
                      >
                        <span>แก้ไขข้อมูลติดต่อ</span>
                      </button>

                      <button
                        type="button"
                        className="secondary-button row-action-btn"
                        onClick={() => handleOpenAuditModal(order)}
                        data-testid={`view-audits-btn-${order.id}`}
                      >
                        <span>ประวัติการแก้ไข ({order.auditCount || 0})</span>
                      </button>

                      <button
                        type="button"
                        className="secondary-button row-action-btn"
                        onClick={() => setViewingOrderDetails(order)}
                        data-testid={`view-details-btn-${order.id}`}
                      >
                        <span>ดูรายละเอียดคำสั่งซื้อ</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalOrdersPages > 1 && (
            <div className="hub-pagination-bar">
              <div className="pagination-info">
                แสดงหน้า {currentPage} จากทั้งหมด {totalOrdersPages} หน้า (รวม {filteredOrders.length} รายการ)
              </div>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                >
                  หน้าก่อนหน้า
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCurrentPage(p => Math.min(totalOrdersPages, p + 1))}
                  disabled={currentPage >= totalOrdersPages}
                >
                  หน้าถัดไป
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Tab 2: Audits Tab */}
      {activeTab === 'audits' && (
        <section className="customer-audits-tab-content" aria-label="ประวัติการแก้ไขข้อมูลติดต่อ">
          {paginatedAudits.length === 0 ? (
            <div className="hub-empty-state-card">
              <p className="empty-title">ยังไม่มีประวัติการแก้ไขข้อมูลติดต่อในระบบ</p>
              <p className="empty-desc">เมื่อแอดมินแก้ไขอีเมลหรือเบอร์โทรของผู้ซื้อ ประวัติการแก้ไขทั้งหมดจะบันทึกที่นี่โดยอัตโนมัติ</p>
            </div>
          ) : (
            <div className="customer-cards-stack">
              {paginatedAudits.map(audit => (
                <article
                  key={audit.id}
                  className="concert-horizontal-row-card audit-record-card"
                  data-testid={`audit-card-${audit.id}`}
                >
                  <div className="row-card-center">
                    <div className="row-card-badge-row">
                      <span className="row-detail-pill amendment-pill">บันทึกการแก้ไข</span>
                      <strong className="order-code-badge">#{audit.orderId}</strong>
                      <span className="row-meta-dot" aria-hidden="true">·</span>
                      <span className="row-meta-item">
                        แก้ไขเมื่อ: {formatDate(toDate(audit.createdAt))} {formatTime(toDate(audit.createdAt))}
                      </span>
                      <span className="row-meta-dot" aria-hidden="true">·</span>
                      <span className="row-meta-item">
                        ผู้ดำเนินการ: <strong>{audit.correctedByName}</strong>
                      </span>
                    </div>

                    <div className="customer-buyer-headline">
                      <h3 className="row-event-title customer-name-title">
                        {audit.buyerName || 'คำสั่งซื้อ'} · {audit.eventTitle || 'คอนเสิร์ต'}
                      </h3>
                    </div>

                    {/* Diff changes */}
                    <div className="audit-diff-box">
                      <div className="audit-diff-line">
                        <span className="diff-label">อีเมล:</span>
                        <span className="diff-old">{audit.previousEmail}</span>
                        <span className="diff-arrow" aria-hidden="true">→</span>
                        <span className="diff-new">{audit.newEmail}</span>
                      </div>
                      <div className="audit-diff-line">
                        <span className="diff-label">เบอร์โทร:</span>
                        <span className="diff-old">{audit.previousPhone}</span>
                        <span className="diff-arrow" aria-hidden="true">→</span>
                        <span className="diff-new">{audit.newPhone}</span>
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="audit-reason-line">
                      <strong>เหตุผลการตรวจสอบ (G-24):</strong> {audit.reason}
                    </div>
                  </div>

                  <div className="row-card-right">
                    <button
                      type="button"
                      className="secondary-button row-action-btn"
                      onClick={() => {
                        handleSearchChange(audit.orderId);
                        handleSelectTab('orders');
                      }}
                    >
                      <span>ดูคำสั่งซื้อนี้</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {totalAuditsPages > 1 && (
            <div className="hub-pagination-bar">
              <div className="pagination-info">
                แสดงหน้า {currentPage} จากทั้งหมด {totalAuditsPages} หน้า (รวม {filteredAudits.length} รายการ)
              </div>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                >
                  หน้าก่อนหน้า
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCurrentPage(p => Math.min(totalAuditsPages, p + 1))}
                  disabled={currentPage >= totalAuditsPages}
                >
                  หน้าถัดไป
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Tab 3: Emails Tab */}
      {activeTab === 'emails' && (
        <section className="customer-emails-tab-content" id="owner-email-deliveries-manager" data-testid="owner-email-deliveries-manager">
          {filteredDeliveries.length === 0 ? (
            <div className="hub-empty-state-card clean-success-empty">
              <CheckCircleIcon className="empty-success-icon" />
              <p className="empty-title">ไม่มีรายการจัดส่งอีเมลที่ล้มเหลว</p>
              <p className="empty-desc">ทุกคำสั่งซื้อจัดส่งบัตรทางอีเมลสำเร็จเรียบร้อยแล้ว</p>
            </div>
          ) : (
            <div className="customer-cards-stack">
              {filteredDeliveries.map(del => (
                <article
                  key={del.id}
                  className="concert-horizontal-row-card email-failure-card"
                  data-testid={`email-delivery-card-${del.id}`}
                >
                  <div className="row-card-center">
                    <div className="row-card-badge-row">
                      <span className="row-detail-pill danger-pill">ส่งไม่สำเร็จ</span>
                      <strong className="order-code-badge">#{del.orderId}</strong>
                      <span className="row-meta-dot" aria-hidden="true">·</span>
                      <span className="row-meta-item">
                        พยายามส่งล่าสุด: {formatDate(toDate(del.updatedAt))} {formatTime(toDate(del.updatedAt))}
                      </span>
                      <span className="row-meta-dot" aria-hidden="true">·</span>
                      <span className="row-meta-item">จำนวนครั้งที่ลอง: {del.retryCount} ครั้ง</span>
                    </div>

                    <div className="customer-buyer-headline">
                      <h3 className="row-event-title customer-name-title">ปลายทาง: {del.recipientEmail}</h3>
                    </div>

                    <div className="row-description-line text-warning">
                      สาเหตุ: {del.error || 'การเชื่อมต่อเซิร์ฟเวอร์ส่งอีเมลล้มเหลว'}
                    </div>
                  </div>

                  <div className="row-card-right">
                    <button
                      type="button"
                      className="primary-button row-action-btn"
                      onClick={() => handleRetryEmail(del.id)}
                      data-testid={`retry-delivery-btn-${del.id}`}
                    >
                      <span>ลองส่งอีเมลใหม่</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Modal 1: Edit Contact Information Modal Popup (Requirement 5) */}
      {editingOrder && (
        <div className="review-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-contact-modal-title">
          <div className="admin-full-dialog-modal edit-contact-dialog" id="contact-edit-form-container">
            {/* Modal Header */}
            <div className="dialog-modal-header">
              <div className="modal-header-titles">
                <span className="modal-category-tag">แก้ไขข้อมูลติดต่อคำสั่งซื้อ</span>
                <h3 id="edit-contact-modal-title" className="modal-concert-title">
                  คำสั่งซื้อ #{editingOrder.id}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={handleCloseEditModal}
                aria-label="ปิดหน้าต่างแก้ไข"
              >
                <XIcon />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmitEditModal}>
              <div className="dialog-modal-body">
                {/* Summary Box */}
                <div className="modal-summary-card">
                  <div className="summary-field">
                    <span className="summary-label">ผู้ซื้อปัจจุบัน:</span>
                    <strong className="summary-val">{editingOrder.buyerName}</strong>
                  </div>
                  <div className="summary-field">
                    <span className="summary-label">คอนเสิร์ต:</span>
                    <strong className="summary-val">{editingOrder.eventTitle}</strong>
                  </div>
                  <div className="summary-field">
                    <span className="summary-label">อีเมลเดิม:</span>
                    <strong className="summary-val">{editingOrder.buyerEmail}</strong>
                  </div>
                  <div className="summary-field">
                    <span className="summary-label">เบอร์โทรเดิม:</span>
                    <strong className="summary-val">{editingOrder.buyerPhone}</strong>
                  </div>
                </div>

                {/* Form Inputs */}
                <div className="modal-form-grid">
                  <div className="form-group-field">
                    <label htmlFor="new-buyer-email" className="modal-field-label">
                      อีเมลใหม่ *
                    </label>
                    <input
                      id="new-buyer-email"
                      type="email"
                      required
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      placeholder="ระบุอีเมลใหม่ของผู้ซื้อ"
                      className="modal-text-input"
                      data-testid="input-new-email"
                    />
                  </div>

                  <div className="form-group-field">
                    <label htmlFor="new-buyer-phone" className="modal-field-label">
                      เบอร์โทรศัพท์ใหม่ *
                    </label>
                    <input
                      id="new-buyer-phone"
                      type="tel"
                      required
                      value={newPhone}
                      onChange={e => setNewPhone(e.target.value)}
                      placeholder="ระบุเบอร์โทรศัพท์ใหม่ เช่น 0812345678"
                      className="modal-text-input"
                      data-testid="input-new-phone"
                    />
                  </div>
                </div>

                <div className="form-group-field" style={{ marginTop: '1rem' }}>
                  <label htmlFor="correction-reason" className="modal-field-label">
                    บันทึกเหตุผลการตรวจสอบตัวตนผู้ซื้อ (G-24) *
                  </label>
                  <textarea
                    id="correction-reason"
                    rows={3}
                    required
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="เช่น ผู้ซื้อติดต่อแจ้งเปลี่ยนอีเมลผ่านช่องทางสนับสนุน พร้อมตรวจสอบบัตรประชาชนและหลักฐานการชำระเงินเรียบร้อย"
                    className="modal-textarea-input"
                    data-testid="input-correction-reason"
                  />
                  <span className="field-hint-text">
                    บันทึกนี้จะถูกจัดเก็บในประวัติการแก้ไขและไม่สามารถลบได้ เพื่อความโปร่งใสของระบบ
                  </span>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="dialog-modal-footer">
                <button
                  type="button"
                  className="secondary-button modal-footer-btn"
                  onClick={handleCloseEditModal}
                  disabled={isSubmittingEdit}
                >
                  <span>ยกเลิก</span>
                </button>
                <button
                  type="submit"
                  className="primary-button modal-footer-btn"
                  disabled={isSubmittingEdit}
                  data-testid="submit-contact-edit-btn"
                >
                  <span>{isSubmittingEdit ? 'กำลังบันทึก...' : 'บันทึกข้อมูลติดต่อ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Audit History Modal Popup (Requirement 5) */}
      {viewingAuditOrder && (
        <div className="review-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="audit-modal-title">
          <div className="admin-full-dialog-modal audit-history-dialog" id="contact-audit-log-container">
            <div className="dialog-modal-header">
              <div className="modal-header-titles">
                <span className="modal-category-tag">ประวัติการแก้ไขข้อมูลติดต่อ</span>
                <h3 id="audit-modal-title" className="modal-concert-title">
                  คำสั่งซื้อ #{viewingAuditOrder.id} ({viewingAuditOrder.buyerName})
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={handleCloseAuditModal}
                aria-label="ปิดหน้าต่างประวัติ"
              >
                <XIcon />
              </button>
            </div>

            <div className="dialog-modal-body">
              {isLoadingAuditLogs ? (
                <div className="hub-empty-state-card">
                  <p className="empty-title">กำลังโหลดประวัติการแก้ไข...</p>
                </div>
              ) : orderAuditLogs.length === 0 ? (
                <div className="hub-empty-state-card">
                  <p className="empty-title">ไม่พบประวัติการแก้ไขสำหรับคำสั่งซื้อนี้</p>
                  <p className="empty-desc">คำสั่งซื้อนี้ยังคงใช้ข้อมูลติดต่อเดิมที่กรอกตอนทำการสั่งซื้อ</p>
                </div>
              ) : (
                <div className="audit-timeline-stack">
                  {orderAuditLogs.map((log, idx) => (
                    <div key={log.id} className="timeline-item-card">
                      <div className="timeline-header-line">
                        <span className="timeline-step-badge">แก้ไขครั้งที่ {orderAuditLogs.length - idx}</span>
                        <span className="timeline-time">
                          {formatDate(toDate(log.createdAt))} เวลา {formatTime(toDate(log.createdAt))}
                        </span>
                        <span className="timeline-admin">โดย: <strong>{log.correctedByName}</strong></span>
                      </div>

                      <div className="audit-diff-box">
                        <div className="audit-diff-line">
                          <span className="diff-label">อีเมล:</span>
                          <span className="diff-old">{log.previousEmail}</span>
                          <span className="diff-arrow" aria-hidden="true">→</span>
                          <span className="diff-new">{log.newEmail}</span>
                        </div>
                        <div className="audit-diff-line">
                          <span className="diff-label">เบอร์โทร:</span>
                          <span className="diff-old">{log.previousPhone}</span>
                          <span className="diff-arrow" aria-hidden="true">→</span>
                          <span className="diff-new">{log.newPhone}</span>
                        </div>
                      </div>

                      <div className="audit-reason-line">
                        <strong>บันทึกเหตุผล (G-24):</strong> {log.reason}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dialog-modal-footer">
              <button
                type="button"
                className="secondary-button modal-footer-btn"
                onClick={handleCloseAuditModal}
              >
                <span>ปิดหน้าต่าง</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Order Details Modal Popup (Requirement 5) */}
      {viewingOrderDetails && (
        <div className="review-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="order-details-modal-title">
          <div className="admin-full-dialog-modal order-details-dialog">
            <div className="dialog-modal-header">
              <div className="modal-header-titles">
                <span className="modal-category-tag">รายละเอียดคำสั่งซื้อ</span>
                <h3 id="order-details-modal-title" className="modal-concert-title">
                  คำสั่งซื้อ #{viewingOrderDetails.id}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={() => setViewingOrderDetails(null)}
                aria-label="ปิดหน้าต่างรายละเอียด"
              >
                <XIcon />
              </button>
            </div>

            <div className="dialog-modal-body">
              <div className="modal-summary-card">
                <div className="summary-field">
                  <span className="summary-label">สถานะการชำระเงิน:</span>
                  <span className="row-detail-pill payout-pill">ชำระเงินเรียบร้อยแล้ว</span>
                </div>
                <div className="summary-field">
                  <span className="summary-label">ชื่อผู้ซื้อ:</span>
                  <strong className="summary-val">{viewingOrderDetails.buyerName}</strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">อีเมลผู้ซื้อ:</span>
                  <strong className="summary-val">{viewingOrderDetails.buyerEmail}</strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">เบอร์โทรศัพท์:</span>
                  <strong className="summary-val">{viewingOrderDetails.buyerPhone}</strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">คอนเสิร์ต:</span>
                  <strong className="summary-val">{viewingOrderDetails.eventTitle}</strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">รอบการแสดง:</span>
                  <strong className="summary-val">
                    {formatDate(toDate(viewingOrderDetails.sessionStartTime))} {formatTime(toDate(viewingOrderDetails.sessionStartTime))}
                  </strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">จำนวนบัตร:</span>
                  <strong className="summary-val">{viewingOrderDetails.ticketCount} ใบ</strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">ยอดบัตร:</span>
                  <strong className="summary-val">{formatBaht(viewingOrderDetails.subtotal)} บาท</strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">ค่าบริการระบบ 3%:</span>
                  <strong className="summary-val">{formatBaht(viewingOrderDetails.customerFee)} บาท</strong>
                </div>
                <div className="summary-field" style={{ gridColumn: 'span 2' }}>
                  <span className="summary-label">ยอดชำระสุทธิ:</span>
                  <strong className="summary-val" style={{ fontSize: '1.25rem', color: '#0f172a' }}>
                    {formatBaht(viewingOrderDetails.total)} บาท
                  </strong>
                </div>
              </div>
            </div>

            <div className="dialog-modal-footer">
              <button
                type="button"
                className="secondary-button modal-footer-btn"
                onClick={() => setViewingOrderDetails(null)}
              >
                <span>ปิดหน้าต่าง</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
