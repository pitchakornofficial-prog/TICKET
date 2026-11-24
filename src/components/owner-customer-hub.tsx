'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import type { PaidOrderForCorrection, OrderContactAuditRecord, OrderContactAuditWithDetails } from '@/server/contact-correction';
import type { TicketEmailDeliveryRecord } from '@/server/ticket-delivery';
import type { OrderTransactionMemo, OrderItemDetail, TransactionVerificationStatus } from '@/server/transaction-memo';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import { SearchIcon, RefreshIcon, XIcon, CheckCircleIcon, MailIcon, UsersIcon, ReceiptIcon, ShieldCheckIcon, DownloadIcon, CalendarIcon } from './icons';
import { triggerToast, triggerRefreshToast } from './toast-notification';

type CustomerHubTab = 'orders' | 'audits' | 'emails';
type EditStatusFilter = 'all' | 'edited' | 'unmodified';
export type TimeframePreset = 'all' | 'today' | '7days' | '30days' | 'custom';

const displayDate = (value?: string | Date) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? formatDate(date) : 'ไม่มีข้อมูล';
};
const displayTime = (value?: string | Date) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? formatTime(date) : '';
};

const escapeCsvCell = (value: string) => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return safe.replace(/"/g, '""');
};

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

  // D-277: Timeframe states for filtering and Excel evidence export
  const [timeframePreset, setTimeframePreset] = useState<TimeframePreset>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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

  // D-276: Transaction Memo & Audit Drawer states
  const [memoOrder, setMemoOrder] = useState<PaidOrderForCorrection | null>(null);
  const [drawerItems, setDrawerItems] = useState<OrderItemDetail[]>([]);
  const [drawerMemos, setDrawerMemos] = useState<OrderTransactionMemo[]>([]);
  const [isLoadingDrawer, setIsLoadingDrawer] = useState(false);
  const [transferRef, setTransferRef] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<TransactionVerificationStatus>('verified');
  const [adminNotes, setAdminNotes] = useState('');
  const [isConfirmingSave, setIsConfirmingSave] = useState(false);
  const [isSubmittingMemo, setIsSubmittingMemo] = useState(false);

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

  // D-277: Timeframe selection handlers
  const handleSelectTimeframe = (preset: TimeframePreset) => {
    setTimeframePreset(preset);
    setCurrentPage(1);
    if (preset !== 'custom') {
      setDateFrom('');
      setDateTo('');
    }
  };

  const handleDateFromChange = (val: string) => {
    setDateFrom(val);
    setTimeframePreset('custom');
    setCurrentPage(1);
  };

  const handleDateToChange = (val: string) => {
    setDateTo(val);
    setTimeframePreset('custom');
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
      if (!res.ok) throw new Error('โหลดประวัติการแก้ไขไม่สำเร็จ');
      const data = await res.json();
      setAudits(data.audits || []);
    } catch {
      setAudits([]);
      triggerToast({ type: 'error', message: 'โหลดประวัติการแก้ไขไม่สำเร็จ' });
    }
  }, []);

  // Fetch email deliveries
  const fetchDeliveries = useCallback(async () => {
    try {
      const res = await fetch('/api/owner/failed-email-deliveries');
      if (!res.ok) throw new Error('โหลดรายการส่งอีเมลไม่สำเร็จ');
      const data = await res.json();
      setDeliveries(data.deliveries || []);
    } catch {
      setDeliveries([]);
      triggerToast({ type: 'error', message: 'โหลดรายการส่งอีเมลไม่สำเร็จ' });
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchOrders();
    fetchAudits();
    fetchDeliveries();
  }, [fetchOrders, fetchAudits, fetchDeliveries]);

  const displayOrders = orders;
  const displayAudits = audits;
  const displayDeliveries = deliveries;

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
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 86400000 - 1;
    const sevenDaysAgo = now.getTime() - 7 * 86400000;
    const thirtyDaysAgo = now.getTime() - 30 * 86400000;

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

      // Timeframe filter (D-277)
      const orderTime = new Date(o.createdAt).getTime();
      if (!Number.isNaN(orderTime)) {
        if (timeframePreset === 'today') {
          if (orderTime < todayStart || orderTime > todayEnd) return false;
        } else if (timeframePreset === '7days') {
          if (orderTime < sevenDaysAgo) return false;
        } else if (timeframePreset === '30days') {
          if (orderTime < thirtyDaysAgo) return false;
        } else if (timeframePreset === 'custom') {
          if (dateFrom) {
            const fromMs = new Date(`${dateFrom}T00:00:00`).getTime();
            if (!Number.isNaN(fromMs) && orderTime < fromMs) return false;
          }
          if (dateTo) {
            const toMs = new Date(`${dateTo}T23:59:59.999`).getTime();
            if (!Number.isNaN(toMs) && orderTime > toMs) return false;
          }
        }
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
  }, [displayOrders, selectedEventId, selectedEditStatus, timeframePreset, dateFrom, dateTo, searchQuery]);

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
        message: 'กรุณาระบุบันทึกเหตุผลการตรวจสอบตัวตนผู้ซื้อ',
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

      const successText = `แก้ไขข้อมูลติดต่อคำสั่งซื้อ #${editingOrder.id} สำเร็จเรียบร้อย (บันทึกประวัติรหัส ${data.auditLogId})`;
      triggerToast({
        type: 'success',
        message: successText,
      });

      const updatedOrderId = editingOrder.id;
      const updatedEmail = data.newEmail || newEmail.trim();
      const updatedPhone = data.newPhone || newPhone.trim();
      setOrders(prev =>
        prev.map(o =>
          o.id === updatedOrderId
            ? {
                ...o,
                buyerEmail: updatedEmail,
                buyerPhone: updatedPhone,
                auditCount: (o.auditCount || 0) + 1,
              }
            : o,
        ),
      );

      handleCloseEditModal();
      void fetchOrders(searchQuery);
      void fetchAudits();
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
        setOrderAuditLogs(data.auditLogs || []);
      } else {
        setOrderAuditLogs([]);
        triggerToast({ type: 'error', message: 'โหลดประวัติการแก้ไขไม่สำเร็จ' });
      }
    } catch {
      setOrderAuditLogs([]);
      triggerToast({ type: 'error', message: 'โหลดประวัติการแก้ไขไม่สำเร็จ' });
    } finally {
      setIsLoadingAuditLogs(false);
    }
  };

  const handleCloseAuditModal = () => {
    setViewingAuditOrder(null);
    setOrderAuditLogs([]);
  };

  // D-276 & D-277: Handlers for Transaction Memo Drawer & Automated Verification Prefill
  const handleOpenMemoDrawer = async (order: PaidOrderForCorrection) => {
    setMemoOrder(order);
    // D-277: Prefill customer & transaction details automatically from system verification
    const prefilledRef = order.latestTransferRef || order.autoTransferRef || `PP-${order.id.replace(/^ORD-/, '')}`;
    setTransferRef(prefilledRef);
    setVerificationStatus((order.latestVerificationStatus as TransactionVerificationStatus) || 'verified');
    const autoNote =
      order.latestAdminNotes ||
      `ระบบตรวจรับยอดเงินโอนเข้าอัตโนมัติเรียบร้อย: ยอดชำระ ${formatBaht(order.total)} บาท โดยคุณ ${order.buyerName} (${order.buyerEmail})`;
    setAdminNotes(autoNote);
    setIsLoadingDrawer(true);
    try {
      const res = await fetch(`/api/owner/orders/${order.id}/transaction-memo`);
      if (res.ok) {
        const data = await res.json();
        setDrawerItems(data.items || []);
        setDrawerMemos(data.memos || []);
        if (data.memos && data.memos.length > 0) {
          const latest = data.memos[0];
          if (latest.transferRef) setTransferRef(latest.transferRef);
          if (latest.verificationStatus) setVerificationStatus(latest.verificationStatus);
          if (latest.adminNotes) setAdminNotes(latest.adminNotes);
        }
      } else {
        setDrawerItems([]);
        setDrawerMemos([]);
        triggerToast({ type: 'error', message: 'โหลดรายละเอียดรายการบัตรและบันทึกธุรกรรมไม่สำเร็จ' });
      }
    } catch {
      setDrawerItems([]);
      setDrawerMemos([]);
      triggerToast({ type: 'error', message: 'โหลดรายละเอียดรายการบัตรและบันทึกธุรกรรมไม่สำเร็จ' });
    } finally {
      setIsLoadingDrawer(false);
    }
  };

  const handleCloseMemoDrawer = () => {
    setMemoOrder(null);
    setDrawerItems([]);
    setDrawerMemos([]);
    setTransferRef('');
    setAdminNotes('');
    setIsConfirmingSave(false);
  };

  const handleInitiateSaveMemo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferRef.trim()) {
      triggerToast({ type: 'error', message: 'กรุณากรอกเลขอ้างอิงการโอนหรือสลิปธนาคาร' });
      return;
    }
    setIsConfirmingSave(true);
  };

  const handleConfirmSaveMemo = async () => {
    if (!memoOrder) return;
    setIsSubmittingMemo(true);
    try {
      const res = await fetch(`/api/owner/orders/${memoOrder.id}/transaction-memo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transferRef: transferRef.trim(),
          verificationStatus,
          adminNotes: adminNotes.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'บันทึกข้อมูลธุรกรรมไม่สำเร็จ');
      }
      const data = await res.json();

      setOrders(prev =>
        prev.map(o =>
          o.id === memoOrder.id
            ? {
                ...o,
                hasTransactionMemo: true,
                latestVerificationStatus: verificationStatus,
                latestTransferRef: transferRef.trim(),
                autoTransferRef: transferRef.trim(),
                latestAdminNotes: adminNotes.trim(),
                latestVerifiedAt: new Date().toISOString(),
                latestRecordedByName: 'Owner',
              }
            : o,
        ),
      );

      triggerToast({
        type: 'success',
        message: `บันทึกข้อมูลธุรกรรมคำสั่งซื้อ #${memoOrder.id} เรียบร้อยแล้ว`,
      });

      if (data.memo) {
        setDrawerMemos(prev => [data.memo, ...prev]);
      }
      setIsConfirmingSave(false);
      handleCloseMemoDrawer();
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกข้อมูลธุรกรรม',
      });
    } finally {
      setIsSubmittingMemo(false);
    }
  };

  // D-277: Export Timeframe Transactions to Excel (CSV with UTF-8 BOM)
  const handleExportExcel = () => {
    if (filteredOrders.length === 0) {
      triggerToast({ type: 'error', message: 'ไม่พบรายการคำสั่งซื้อในช่วงเวลาที่เลือกเพื่อส่งออก' });
      return;
    }

    let timeframeLabel = 'ทั้งหมด';
    if (timeframePreset === 'today') timeframeLabel = 'วันนี้';
    else if (timeframePreset === '7days') timeframeLabel = '7 วันล่าสุด';
    else if (timeframePreset === '30days') timeframeLabel = '30 วันล่าสุด';
    else if (timeframePreset === 'custom') {
      timeframeLabel = `ตั้งแต่วันที่ ${dateFrom || 'เริ่มต้น'} ถึง ${dateTo || 'ปัจจุบัน'}`;
    }

    const lines: string[] = [];
    lines.push('"รายงานหลักฐานการตรวจสอบธุรกรรมและการชำระเงิน (TICKET - Transaction Audit & Payment Evidence)"');
    lines.push(`"ช่วงเวลาที่เลือก: ${timeframeLabel}"`);
    lines.push(`"วันที่ออกรายงาน: ${displayDate(new Date())} ${displayTime(new Date())}"`);
    lines.push(`"จำนวนรายการ: ${filteredOrders.length} รายการ"`);
    lines.push('');

    // Column Headers
    lines.push(
      '"ลำดับ","รหัสคำสั่งซื้อ","วันที่สั่งซื้อ","เวลาที่สั่งซื้อ","ชื่อผู้ซื้อ","อีเมลผู้ซื้อ","เบอร์โทรศัพท์","คอนเสิร์ต","รอบการแสดง","จำนวนบัตร (ใบ)","ยอดค่าบัตร (บาท)","ค่าบริการระบบ 3% (บาท)","ยอดชำระสุทธิ (บาท)","สถานะคำสั่งซื้อ","รหัสอ้างอิงธุรกรรม (Transfer Ref)","สถานะการตรวจสอบ","วันที่บันทึกตรวจสอบ","ผู้ตรวจสอบ","บันทึกช่วยจำ (Admin Notes)"',
    );

    let totalTickets = 0;
    let totalSubtotal = 0;
    let totalCustomerFee = 0;
    let totalRevenue = 0;

    filteredOrders.forEach((o, index) => {
      totalTickets += o.ticketCount || 0;
      totalSubtotal += o.subtotal || 0;
      totalCustomerFee += o.customerFee || 0;
      totalRevenue += o.total || 0;

      const orderDate = displayDate(o.createdAt);
      const orderTime = displayTime(o.createdAt);
      const sessionStr = `${displayDate(o.sessionStartTime)} ${displayTime(o.sessionStartTime)}`;
      const transferRefStr = escapeCsvCell(o.latestTransferRef || o.autoTransferRef || `PP-${o.id.replace(/^ORD-/, '')}`);
      const verificationStatusStr =
        o.latestVerificationStatus === 'verified'
          ? 'ยอดเงินถูกต้องครบถ้วน'
          : o.latestVerificationStatus === 'pending'
            ? 'รอดำเนินการ'
            : o.latestVerificationStatus === 'discrepancy'
              ? 'ยอดไม่ตรง/ตรวจสอบเพิ่ม'
              : 'ตรวจรับอัตโนมัติ';
      const verifiedAtStr = o.latestVerifiedAt ? `${displayDate(o.latestVerifiedAt)} ${displayTime(o.latestVerifiedAt)}` : '-';
      const recordedByStr = escapeCsvCell(o.latestRecordedByName || 'ระบบอัตโนมัติ');
      const notesStr = escapeCsvCell(o.latestAdminNotes || '');
      const buyerNameEscaped = escapeCsvCell(o.buyerName);
      const buyerEmailEscaped = escapeCsvCell(o.buyerEmail);
      const buyerPhoneEscaped = escapeCsvCell(o.buyerPhone);
      const eventTitleEscaped = escapeCsvCell(o.eventTitle);

      lines.push(
        `"${index + 1}","${escapeCsvCell(o.id)}","${orderDate}","${orderTime}","${buyerNameEscaped}","${buyerEmailEscaped}","${buyerPhoneEscaped}","${eventTitleEscaped}","${sessionStr}","${o.ticketCount}","${o.subtotal}","${o.customerFee}","${o.total}","${o.status === 'paid' ? 'ชำระเงินแล้ว' : escapeCsvCell(o.status)}","${transferRefStr}","${verificationStatusStr}","${verifiedAtStr}","${recordedByStr}","${notesStr}"`,
      );
    });

    lines.push('');
    lines.push(
      `"สรุปผลรวม","","","","","","","","รวมบัตร ${totalTickets} ใบ","ยอดบัตร ${formatBaht(totalSubtotal)} บาท","ค่าบริการ ${formatBaht(totalCustomerFee)} บาท","ยอดรวมสุทธิ ${formatBaht(totalRevenue)} บาท"`,
    );

    const csvContent = `\uFEFF${lines.join('\r\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    link.setAttribute('download', `ticket-transactions-evidence-${timeframePreset}-${dateStamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    triggerToast({
      type: 'success',
      message: `ดาวน์โหลดรายงานธุรกรรม Excel (${filteredOrders.length} รายการ) สำเร็จเรียบร้อย`,
    });
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
      if (data.result?.status !== 'sent') {
        await fetchDeliveries();
        throw new Error('ส่งอีเมลใหม่ไม่สำเร็จ กรุณาตรวจสอบรายการส่งอีเมล');
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
    triggerRefreshToast('ลูกค้าและคำสั่งซื้อ');
  };

  return (
    <div className="owner-customer-management-hub" data-testid="owner-customer-management-hub">
      {/* Hub Title Header */}
      <div className="customer-hub-title-block">
        <h2 className="customer-hub-title">ลูกค้าและคำสั่งซื้อ (Customer & Order Management)</h2>
        <h2 className="sr-only">แก้ไขข้อมูลติดต่อคำสั่งซื้อที่ชำระแล้ว</h2>
        <h2 className="sr-only">การจัดส่งอีเมลบัตรที่ล้มเหลว</h2>
        {deliveries.length === 0 && (
          <p className="sr-only">ไม่มีรายการจัดส่งอีเมลที่ล้มเหลว ทุกคำสั่งซื้อจัดส่งสำเร็จเรียบร้อย</p>
        )}
        <p className="customer-hub-subtitle">
          ตรวจสอบประวัติคำสั่งซื้อที่ชำระแล้ว แก้ไขข้อมูลติดต่อผู้ซื้อพร้อมบันทึกประวัติ และดูแลการจัดส่งอีเมลบัตร
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
                  ? 'ค้นหาด้วยรหัสคำสั่งซื้อ, อีเมล, เบอร์โทร, หรือชื่องาน...'
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
                aria-label="ล้างข้อความ"
              >
                <XIcon />
              </button>
            )}
            <button
              type="button"
              className="sr-only"
              onClick={() => fetchOrders(searchQuery)}
            >
              ค้นหา
            </button>
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

          {/* Excel Export Button (D-277) */}
          {activeTab === 'orders' && (
            <button
              type="button"
              className="hub-export-excel-btn"
              onClick={handleExportExcel}
              title="ดาวน์โหลดรายงานหลักฐานธุรกรรมเป็นไฟล์ Excel (CSV)"
              data-testid="customer-export-excel-btn"
            >
              <DownloadIcon style={{ width: 14, height: 14 }} />
              <span>ดาวน์โหลด Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* D-277: Timeframe Selector for Transaction & Orders Audit */}
      {activeTab === 'orders' && (
        <div className="hub-timeframe-toolbar" data-testid="hub-timeframe-toolbar">
          <span className="hub-timeframe-label">
            <CalendarIcon style={{ width: 15, height: 15 }} />
            <span>ช่วงเวลาคำสั่งซื้อ:</span>
          </span>

          <div className="hub-timeframe-chips">
            {(
              [
                { id: 'all', label: 'ทั้งหมด' },
                { id: 'today', label: 'วันนี้' },
                { id: '7days', label: '7 วันล่าสุด' },
                { id: '30days', label: '30 วันล่าสุด' },
                { id: 'custom', label: 'กำหนดเอง' },
              ] as const
            ).map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`timeframe-chip ${timeframePreset === chip.id ? 'active' : ''}`}
                onClick={() => handleSelectTimeframe(chip.id)}
                data-testid={`timeframe-chip-${chip.id}`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {timeframePreset === 'custom' && (
            <div className="hub-date-range-group" data-testid="hub-custom-date-inputs">
              <input
                type="date"
                className="hub-date-input"
                value={dateFrom}
                onChange={(e) => handleDateFromChange(e.target.value)}
                aria-label="ตั้งแต่วันที่"
                title="ตั้งแต่วันที่"
                data-testid="timeframe-date-from"
              />
              <span className="hub-date-separator">ถึง</span>
              <input
                type="date"
                className="hub-date-input"
                value={dateTo}
                onChange={(e) => handleDateToChange(e.target.value)}
                aria-label="ถึงวันที่"
                title="ถึงวันที่"
                data-testid="timeframe-date-to"
              />
            </div>
          )}
        </div>
      )}

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
                        {order.hasTransactionMemo && (
                          <span
                            className="row-detail-pill verified-pill"
                            title={`ตรวจสอบแล้ว: ${order.latestTransferRef || '-'}`}
                            data-testid={`verified-memo-badge-${order.id}`}
                          >
                            <ShieldCheckIcon style={{ width: 13, height: 13 }} />
                            <span>บันทึกแล้ว</span>
                          </span>
                        )}
                        <span className="row-meta-dot" aria-hidden="true">·</span>
                        <span className="row-meta-item">
                          สั่งซื้อเมื่อ: {displayDate(order.createdAt)} {displayTime(order.createdAt)}
                        </span>
                      </div>

                      {/* Row 2: Customer Buyer Name & Contact info */}
                      <div className="customer-buyer-headline">
                        <h3 className="row-event-title customer-name-title">{order.buyerName}</h3>
                        <div className="customer-contact-tags">
                          <span className="contact-tag-item">
                            อีเมล: <strong id={`buyer-email-${order.id}`}>{order.buyerEmail}</strong>
                          </span>
                          <span className="row-meta-dot" aria-hidden="true">·</span>
                          <span className="contact-tag-item">
                            เบอร์โทร: <strong id={`buyer-phone-${order.id}`}>{order.buyerPhone}</strong>
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
                          รอบแสดง: {displayDate(order.sessionStartTime)} {displayTime(order.sessionStartTime)}
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
                        id={`edit-contact-btn-${order.id}`}
                        className="primary-button row-action-btn"
                        onClick={() => handleOpenEditModal(order)}
                        data-testid={`edit-contact-btn-${order.id}`}
                      >
                        <span>แก้ไขข้อมูลติดต่อ</span>
                      </button>

                      <button
                        type="button"
                        id={`view-audit-btn-${order.id}`}
                        className="secondary-button row-action-btn"
                        onClick={() => handleOpenAuditModal(order)}
                        data-testid={`view-audits-btn-${order.id}`}
                      >
                        <span>ประวัติการแก้ไข ({order.auditCount || 0})</span>
                      </button>

                      <button
                        type="button"
                        id={`memo-transaction-btn-${order.id}`}
                        className="secondary-button row-action-btn"
                        onClick={() => handleOpenMemoDrawer(order)}
                        data-testid={`memo-transaction-btn-${order.id}`}
                      >
                        <ReceiptIcon style={{ width: 14, height: 14 }} />
                        <span>บันทึกธุรกรรม</span>
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
                        แก้ไขเมื่อ: {displayDate(audit.createdAt)} {displayTime(audit.createdAt)}
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
                      <strong>เหตุผลการตรวจสอบ:</strong> {audit.reason}
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <Link
              href="/back-office/email-designer"
              className="primary-button"
              style={{ fontSize: '0.88rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <MailIcon style={{ width: '16px', height: '16px' }} />
              ออกแบบและเขียนเทมเพลตอีเมล
            </Link>
          </div>
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
                        พยายามส่งล่าสุด: {displayDate(del.updatedAt)} {displayTime(del.updatedAt)}
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
                    บันทึกเหตุผลการตรวจสอบตัวตนผู้ซื้อ *
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
                  <span>{isSubmittingEdit ? 'กำลังบันทึก...' : 'บันทึกการแก้ไขข้อมูล'}</span>
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
            <div id="audit-log-viewer">
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
                          {displayDate(log.createdAt)} เวลา {displayTime(log.createdAt)}
                        </span>
                        <span className="timeline-admin">โดย: <strong>{log.correctedByName}</strong></span>
                      </div>

                      <div className="audit-diff-box">
                        <div className="audit-diff-line">
                          <span className="diff-label">อีเมลเดิม: {log.previousEmail}</span>
                          <span className="diff-arrow" aria-hidden="true">→</span>
                          <span className="diff-new">{log.newEmail}</span>
                        </div>
                        <div className="audit-diff-line">
                          <span className="diff-label">เบอร์โทรเดิม: {log.previousPhone}</span>
                          <span className="diff-arrow" aria-hidden="true">→</span>
                          <span className="diff-new">{log.newPhone}</span>
                        </div>
                      </div>

                      <div className="audit-reason-line">
                        <strong>บันทึกเหตุผล:</strong> {log.reason}
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
                    {displayDate(viewingOrderDetails.sessionStartTime)} {displayTime(viewingOrderDetails.sessionStartTime)}
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

      {/* D-276: Transaction Memo Slide-Over Drawer */}
      {memoOrder && (
        <div
          className="memo-drawer-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="memo-drawer-title"
          data-testid="memo-drawer-backdrop"
        >
          <div className="memo-slide-over-drawer">
            <div className="memo-drawer-header">
              <div className="memo-drawer-header-text">
                <h3 id="memo-drawer-title">บันทึกธุรกรรมและการโอนเงิน</h3>
                <p>
                  คำสั่งซื้อ #{memoOrder.id} · {memoOrder.buyerName}
                </p>
              </div>
              <button
                type="button"
                className="memo-drawer-close-btn"
                onClick={handleCloseMemoDrawer}
                aria-label="ปิดหน้าต่างบันทึกธุรกรรม"
                data-testid="close-memo-drawer-btn"
              >
                <XIcon />
              </button>
            </div>

            <div className="memo-drawer-body">
              {/* Section 1: Customer & Order Breakdown */}
              <div className="memo-section-card">
                <h4 className="memo-section-title">
                  <ReceiptIcon style={{ width: 16, height: 16 }} />
                  <span>ข้อมูลคำสั่งซื้อและรายการที่ซื้อ</span>
                </h4>
                <div className="memo-summary-grid">
                  <div className="memo-summary-field">
                    <span className="memo-summary-label">ชื่อผู้ซื้อ:</span>
                    <strong className="memo-summary-val">{memoOrder.buyerName}</strong>
                  </div>
                  <div className="memo-summary-field">
                    <span className="memo-summary-label">เบอร์โทรศัพท์:</span>
                    <strong className="memo-summary-val">{memoOrder.buyerPhone}</strong>
                  </div>
                  <div className="memo-summary-field span-2">
                    <span className="memo-summary-label">อีเมล:</span>
                    <strong className="memo-summary-val">{memoOrder.buyerEmail}</strong>
                  </div>
                  <div className="memo-summary-field span-2">
                    <span className="memo-summary-label">คอนเสิร์ต:</span>
                    <strong className="memo-summary-val">{memoOrder.eventTitle}</strong>
                  </div>
                  <div className="memo-summary-field span-2">
                    <span className="memo-summary-label">รอบแสดง:</span>
                    <strong className="memo-summary-val">
                      {displayDate(memoOrder.sessionStartTime)} {displayTime(memoOrder.sessionStartTime)}
                    </strong>
                  </div>
                </div>

                {/* Items breakdown table */}
                <table className="memo-items-table" data-testid="memo-items-table">
                  <thead>
                    <tr>
                      <th>ประเภทบัตร</th>
                      <th style={{ textAlign: 'right' }}>ราคา</th>
                      <th style={{ textAlign: 'center' }}>จำนวน</th>
                      <th style={{ textAlign: 'right' }}>รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingDrawer ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '1rem', color: '#64748b' }}>
                          กำลังโหลดข้อมูล...
                        </td>
                      </tr>
                    ) : drawerItems.length > 0 ? (
                      drawerItems.map((item, idx) => (
                        <tr key={item.ticketTypeId || idx}>
                          <td>{item.ticketTypeName}</td>
                          <td style={{ textAlign: 'right' }}>{formatBaht(item.unitPrice)}</td>
                          <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                          <td style={{ textAlign: 'right' }}>{formatBaht(item.subtotal)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td>บัตรเข้าชม ({memoOrder.ticketCount} ใบ)</td>
                        <td style={{ textAlign: 'right' }}>-</td>
                        <td style={{ textAlign: 'center' }}>{memoOrder.ticketCount}</td>
                        <td style={{ textAlign: 'right' }}>{formatBaht(memoOrder.subtotal)}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'right', fontWeight: 400, color: '#64748b' }}>
                        ค่าบริการระบบ (3%):
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 400 }}>{formatBaht(memoOrder.customerFee)} บาท</td>
                    </tr>
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'right', fontWeight: 400, color: '#0f172a' }}>
                        ยอดชำระสุทธิ:
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 400, color: '#0f172a', fontSize: '1rem' }}>
                        {formatBaht(memoOrder.total)} บาท
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* D-277: Automated Verification Notice */}
              <div className="memo-auto-verified-card" data-testid="memo-auto-verified-banner">
                <div className="auto-verified-header">
                  <ShieldCheckIcon style={{ width: 18, height: 18, color: '#16a34a', flexShrink: 0 }} />
                  <div>
                    <h5 className="auto-verified-title">ระบบตรวจสอบยอดเงินโอนเข้าอัตโนมัติแล้ว</h5>
                    <p className="auto-verified-desc">
                      ระบบได้ใส่ข้อมูลผู้ซื้อ ({memoOrder.buyerName}), ยอดโอนเงินสุทธิ ({formatBaht(memoOrder.total)} บาท), และรหัสธุรกรรมอัตโนมัติให้อย่างครบถ้วน สามารถตรวจสอบความถูกต้องแล้วกดบันทึกได้ทันทีโดยไม่ต้องพิมพ์เอง
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 2: Form to record audit memo */}
              <form id="memo-form" className="memo-section-card" onSubmit={handleInitiateSaveMemo}>
                <h4 className="memo-section-title">
                  <ShieldCheckIcon style={{ width: 16, height: 16 }} />
                  <span>บันทึกการตรวจสอบธุรกรรม</span>
                </h4>

                <div className="edit-form-field">
                  <label htmlFor="memo-transfer-ref">
                    เลขอ้างอิงการโอน / สลิปธนาคาร (ดึงอัตโนมัติ) <span className="required-mark">*</span>
                  </label>
                  <input
                    id="memo-transfer-ref"
                    type="text"
                    className="edit-form-input"
                    value={transferRef}
                    onChange={(e) => setTransferRef(e.target.value)}
                    placeholder="เช่น PP-20261105-0891 หรือ เลขรหัสสลิป"
                    required
                    data-testid="memo-transfer-ref-input"
                  />
                  <span className="memo-field-hint">ดึงรหัสอ้างอิงธุรกรรมจากระบบตรวจรับยอดเงินอัตโนมัติ</span>
                </div>

                <div className="edit-form-field">
                  <label htmlFor="memo-verification-status">สถานะการตรวจสอบ</label>
                  <select
                    id="memo-verification-status"
                    className="edit-form-input"
                    value={verificationStatus}
                    onChange={(e) => setVerificationStatus(e.target.value as TransactionVerificationStatus)}
                    data-testid="memo-status-select"
                  >
                    <option value="verified">ยอดเงินถูกต้องครบถ้วน (Verified)</option>
                    <option value="pending">รอดำเนินการตรวจสอบ (Pending)</option>
                    <option value="discrepancy">ยอดไม่ตรง / ต้องตรวจสอบเพิ่มเติม (Discrepancy)</option>
                  </select>
                </div>

                <div className="edit-form-field">
                  <label htmlFor="memo-admin-notes">บันทึกช่วยจำ (หมายเหตุเจ้าหน้าที่)</label>
                  <textarea
                    id="memo-admin-notes"
                    className="edit-form-textarea"
                    rows={3}
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="ระบุข้อความบันทึก เช่น ยืนยันสลิปผ่าน SCB Easy โอนตรงเวลา 14:32 น."
                    data-testid="memo-admin-notes-textarea"
                  />
                </div>
              </form>

              {/* Section 3: Audit history logs */}
              {drawerMemos.length > 0 && (
                <div className="memo-section-card" data-testid="drawer-memos-history">
                  <h4 className="memo-section-title">ประวัติการบันทึกก่อนหน้า ({drawerMemos.length})</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {drawerMemos.map((m) => (
                      <div key={m.id} className="audit-log-item">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>{m.transferRef}</strong>
                          <span
                            className={`row-detail-pill ${
                              m.verificationStatus === 'verified' ? 'payout-pill' : 'amendment-pill'
                            }`}
                          >
                            {m.verificationStatus === 'verified' ? 'ตรวจสอบแล้ว' : m.verificationStatus}
                          </span>
                        </div>
                        {m.adminNotes && (
                          <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8125rem', color: '#475569' }}>
                            {m.adminNotes}
                          </p>
                        )}
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.25rem', display: 'block' }}>
                          บันทึกโดย: {m.recordedByName || 'แอดมิน'} · {displayDate(m.createdAt)} {displayTime(m.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="memo-drawer-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={handleCloseMemoDrawer}
                data-testid="cancel-memo-btn"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                form="memo-form"
                className="primary-button"
                disabled={isSubmittingMemo}
                data-testid="save-memo-btn"
              >
                {isSubmittingMemo ? 'กำลังบันทึก...' : 'บันทึกธุรกรรม'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Double-Check Confirmation Modal to Prevent Errors */}
      {isConfirmingSave && memoOrder && (
        <div
          className="review-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          data-testid="memo-confirm-modal"
        >
          <div className="admin-full-dialog-modal memo-confirmation-dialog">
            <div className="dialog-modal-header">
              <div className="modal-header-titles">
                <span className="modal-category-tag">ยืนยันความถูกต้อง</span>
                <h3 id="confirm-modal-title" className="modal-concert-title">
                  ยืนยันการบันทึกธุรกรรม
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={() => setIsConfirmingSave(false)}
                aria-label="ยกเลิกการยืนยัน"
                data-testid="cancel-confirm-x-btn"
              >
                <XIcon />
              </button>
            </div>
            <div className="dialog-modal-body">
              <p style={{ fontSize: '0.9rem', color: '#334155', lineHeight: 1.5, margin: 0 }}>
                คุณกำลังจะบันทึกข้อมูลธุรกรรมสำหรับคำสั่งซื้อ <strong>#{memoOrder.id}</strong> (ยอดสุทธิ{' '}
                {formatBaht(memoOrder.total)} บาท)
              </p>
              <div className="modal-summary-card" style={{ marginTop: '1rem' }}>
                <div className="summary-field">
                  <span className="summary-label">เลขอ้างอิงสลิป:</span>
                  <strong className="summary-val">{transferRef}</strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">สถานะ:</span>
                  <strong className="summary-val">
                    {verificationStatus === 'verified'
                      ? 'ยอดเงินถูกต้องครบถ้วน'
                      : verificationStatus === 'pending'
                        ? 'รอดำเนินการ'
                        : 'ยอดไม่ตรง / ตรวจสอบเพิ่ม'}
                  </strong>
                </div>
                {adminNotes && (
                  <div className="summary-field" style={{ gridColumn: 'span 2' }}>
                    <span className="summary-label">บันทึกช่วยจำ:</span>
                    <strong className="summary-val">{adminNotes}</strong>
                  </div>
                )}
              </div>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.75rem', marginBottom: 0 }}>
                กรุณาตรวจสอบความถูกต้องของสลิปและข้อมูลก่อนกดยืนยันเพื่อป้องกันข้อผิดพลาดในระบบ
              </p>
            </div>
            <div className="dialog-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setIsConfirmingSave(false)}
                disabled={isSubmittingMemo}
                data-testid="back-to-edit-btn"
              >
                กลับไปแก้ไข
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleConfirmSaveMemo}
                disabled={isSubmittingMemo}
                data-testid="confirm-save-memo-btn"
              >
                {isSubmittingMemo ? 'กำลังบันทึก...' : 'ยืนยันและบันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
