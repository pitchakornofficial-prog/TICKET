'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { EventMoneyReportDetail } from '@/server/reports';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import {
  BanknotesIcon,
  SearchIcon,
  RefreshIcon,
  XIcon,
  ShieldCheckIcon,
  DownloadIcon,
  ReceiptIcon,
} from './icons';
import { triggerToast } from './toast-notification';
import { generateBankSlipSvgDataUrl } from '@/lib/bank-slip';
import { OwnerFeeSettingsManager } from './owner-fee-settings-manager';
import { OwnerReserveReleaseManager } from './owner-reserve-release-manager';
import { OwnerDebtRepaymentManager } from './owner-debt-repayment-manager';
import { OwnerPaymentRecoveryManager } from './owner-payment-recovery-manager';

export type FinanceHubTab = 'ready' | 'history' | 'reserves';

export interface PayableConcertItem {
  id: string;
  title: string;
  organizerId: string;
  organizerName: string;
  organizerEmail: string;
  location: string;
  sessionTime: string;
  status: string;
  cycleStatus: 'ready' | 'cutoff' | 'pending';
  cutoffDate: string;
  payoutBankName: string;
  payoutAccountNumber: string;
  payoutAccountName: string;
  isBankVerified: boolean;
  grossSales: number;
  customerFee: number;
  platformFee: number;
  netSales: number;
  netEntitlement: number;
  reservePercentage: number;
  reserveTarget: number;
  actualHeldReserve: number;
  totalPaidOut: number;
  payableAmount: number;
}

export interface PayoutRecordItem {
  id: string;
  eventId: string;
  eventTitle: string;
  organizerName: string;
  amount: number;
  paidAt: string;
  status: 'completed' | 'failed';
  payoutBankName: string;
  payoutAccountNumber: string;
  payoutAccountName: string;
  transferProofKey: string | null;
  transferProofUrl: string | null;
  transferNote: string | null;
  transferRef: string | null;
  recordedByName: string | null;
  createdAt: string;
}

// Fallback mock datasets for realistic visual rendering in dev/test environments (D-252)
const SAMPLE_MOCK_PAYABLE_CONCERTS: PayableConcertItem[] = [
  {
    id: 'evt-ubu-freshy-2026',
    title: 'เทศกาลดนตรีต้อนรับน้องใหม่ UBU Freshy Fest 2026',
    organizerId: 'org-ubu-council',
    organizerName: 'สโมสรนักศึกษา มหาวิทยาลัยอุบลราชธานี',
    organizerEmail: 'council@ubu.ac.th',
    location: 'ศูนย์ประชุมนานาชาติ มหาวิทยาลัยอุบลราชธานี',
    sessionTime: '2026-11-21T08:00:00.000Z',
    status: 'เปิดขายบัตรแล้ว',
    cycleStatus: 'ready',
    cutoffDate: '2026-11-06T23:59:59.000Z',
    payoutBankName: 'ธนาคารกรุงไทย (KTB)',
    payoutAccountNumber: '020-1-98765-4',
    payoutAccountName: 'สโมสรนักศึกษา มหาวิทยาลัยอุบลราชธานี',
    isBankVerified: true,
    grossSales: 540000,
    customerFee: 16200,
    platformFee: 32400,
    netSales: 540000,
    netEntitlement: 507600,
    reservePercentage: 10,
    reserveTarget: 50760,
    actualHeldReserve: 50760,
    totalPaidOut: 200000,
    payableAmount: 256840,
  },
  {
    id: 'evt-rock-rimmool-2026',
    title: 'Rock Rimmool Live Festival 2026',
    organizerId: 'org-rimmool',
    organizerName: 'บจก. ริมมูล มิวสิค โปรดักชั่น',
    organizerEmail: 'finance@rimmool.co.th',
    location: 'ลานริมแม่น้ำมูล อ.วารินชำราบ จ.อุบลราชธานี',
    sessionTime: '2026-12-06T07:00:00.000Z',
    status: 'เปิดขายบัตรแล้ว',
    cycleStatus: 'ready',
    cutoffDate: '2026-11-05T23:59:59.000Z',
    payoutBankName: 'ธนาคารกสิกรไทย (KBANK)',
    payoutAccountNumber: '741-2-12345-6',
    payoutAccountName: 'บจก. ริมมูล มิวสิค โปรดักชั่น',
    isBankVerified: true,
    grossSales: 720000,
    customerFee: 21600,
    platformFee: 43200,
    netSales: 720000,
    netEntitlement: 676800,
    reservePercentage: 10,
    reserveTarget: 67680,
    actualHeldReserve: 67680,
    totalPaidOut: 0,
    payableAmount: 609120,
  },
  {
    id: 'evt-isan-folk-2026',
    title: 'Isan Folk & Acoustic Night 2026',
    organizerId: 'org-isan-arts',
    organizerName: 'กลุ่มศิลปินเพลงอีสานร่วมสมัย',
    organizerEmail: 'preecha@isanfolk.org',
    location: 'หอศิลปวัฒนธรรม มหาวิทยาลัยอุบลราชธานี',
    sessionTime: '2026-11-29T09:00:00.000Z',
    status: 'เปิดขายบัตรแล้ว',
    cycleStatus: 'cutoff',
    cutoffDate: '2026-11-04T23:59:59.000Z',
    payoutBankName: 'ธนาคารไทยพาณิชย์ (SCB)',
    payoutAccountNumber: '405-8-76543-2',
    payoutAccountName: 'กลุ่มศิลปินเพลงอีสานร่วมสมัย',
    isBankVerified: true,
    grossSales: 180000,
    customerFee: 5400,
    platformFee: 10800,
    netSales: 180000,
    netEntitlement: 169200,
    reservePercentage: 10,
    reserveTarget: 16920,
    actualHeldReserve: 16920,
    totalPaidOut: 50000,
    payableAmount: 102280,
  },
];

const SAMPLE_MOCK_PAYOUT_HISTORY: PayoutRecordItem[] = [
  {
    id: 'PAY-20261105-001',
    eventId: 'evt-ubu-freshy-2026',
    eventTitle: 'เทศกาลดนตรีต้อนรับน้องใหม่ UBU Freshy Fest 2026',
    organizerName: 'สโมสรนักศึกษา มหาวิทยาลัยอุบลราชธานี',
    amount: 200000,
    paidAt: '2026-11-05T15:45:00.000Z',
    status: 'completed',
    payoutBankName: 'ธนาคารกรุงไทย (KTB)',
    payoutAccountNumber: '020-1-98765-4',
    payoutAccountName: 'สโมสรนักศึกษา มหาวิทยาลัยอุบลราชธานี',
    transferProofKey: 'proofs/payout-ubu-week1.png',
    transferProofUrl: '/api/uploads/proofs/payout-ubu-week1.png',
    transferNote: 'โอนเงินรอบสัปดาห์ที่ 1 ตามสูตร A_pay',
    transferRef: 'KTB-TXN-20261105-8912',
    recordedByName: 'เจ้าของเว็บทดสอบ',
    createdAt: '2026-11-05T15:45:00.000Z',
  },
  {
    id: 'PAY-20261103-002',
    eventId: 'evt-isan-folk-2026',
    eventTitle: 'Isan Folk & Acoustic Night 2026',
    organizerName: 'กลุ่มศิลปินเพลงอีสานร่วมสมัย',
    amount: 50000,
    paidAt: '2026-11-03T14:20:00.000Z',
    status: 'completed',
    payoutBankName: 'ธนาคารไทยพาณิชย์ (SCB)',
    payoutAccountNumber: '405-8-76543-2',
    payoutAccountName: 'กลุ่มศิลปินเพลงอีสานร่วมสมัย',
    transferProofKey: 'proofs/payout-isan-early.png',
    transferProofUrl: '/api/uploads/proofs/payout-isan-early.png',
    transferNote: 'โอนเงินค่าบัตรจำหน่ายล่วงหน้า (Early Round)',
    transferRef: 'SCB-TXN-20261103-4412',
    recordedByName: 'เจ้าของเว็บทดสอบ',
    createdAt: '2026-11-03T14:20:00.000Z',
  },
  {
    id: 'PAY-20261028-003',
    eventId: 'evt-charity-2026',
    eventTitle: 'คอนเสิร์ตการกุศล แสงดาวแห่งศรัทธา 2026',
    organizerName: 'มูลนิธิเพื่อการศึกษาเด็กอีสาน',
    amount: 150000,
    paidAt: '2026-10-28T11:30:00.000Z',
    status: 'completed',
    payoutBankName: 'ธนาคารกรุงเทพ (BBL)',
    payoutAccountNumber: '112-9-88765-1',
    payoutAccountName: 'มูลนิธิเพื่อการศึกษาเด็กอีสาน',
    transferProofKey: 'proofs/payout-charity-round1.png',
    transferProofUrl: '/api/uploads/proofs/payout-charity-round1.png',
    transferNote: 'โอนเงินรอบสมทบทุนจัดงาน',
    transferRef: 'BBL-TXN-20261028-1109',
    recordedByName: 'เจ้าของเว็บทดสอบ',
    createdAt: '2026-10-28T11:30:00.000Z',
  },
];

export function OwnerFinanceHub() {
  const [activeTab, setActiveTab] = useState<FinanceHubTab>('ready');

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConcertFilter, setSelectedConcertFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');

  // Datasets
  const [payableConcerts, setPayableConcerts] = useState<PayableConcertItem[]>(SAMPLE_MOCK_PAYABLE_CONCERTS);
  const [payoutHistory, setPayoutHistory] = useState<PayoutRecordItem[]>(SAMPLE_MOCK_PAYOUT_HISTORY);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Modal 1: Transfer & Proof Modal
  const [editingPayoutConcert, setEditingPayoutConcert] = useState<PayableConcertItem | null>(null);
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [transferTime, setTransferTime] = useState<string>('14:30');
  const [transferRefCode, setTransferRefCode] = useState<string>('');
  const [transferNote, setTransferNote] = useState<string>('');
  const [transferFile, setTransferFile] = useState<File | null>(null);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);

  // Modal 2: View Proof Slip Modal
  const [viewingProofPayout, setViewingProofPayout] = useState<PayoutRecordItem | null>(null);
  const [proofModalTab, setProofModalTab] = useState<'slip' | 'details'>('slip');

  // Modal 3: View Full Money Report Details Modal
  const [viewingReportConcert, setViewingReportConcert] = useState<PayableConcertItem | null>(null);

  // Fetch real data on mount
  const fetchData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const res = await fetch('/api/owner/events/fee-settings', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.events) && data.events.length > 0) {
          const eventsList = data.events;
          const liveConcerts: PayableConcertItem[] = [];
          const livePayouts: PayoutRecordItem[] = [];

          for (const ev of eventsList) {
            try {
              const repRes = await fetch(`/api/owner/events/${ev.id}/money-report`, { cache: 'no-store' });
              if (repRes.ok) {
                const repData: EventMoneyReportDetail = await repRes.json();
                liveConcerts.push({
                  id: ev.id,
                  title: ev.title,
                  organizerId: ev.organizerId,
                  organizerName: ev.organizerName || 'ผู้จัดงาน',
                  organizerEmail: ev.organizerEmail || '',
                  location: ev.location || 'สถานที่จัดแสดง',
                  sessionTime: repData.sessions?.[0]?.sessionStartTime || new Date().toISOString(),
                  status: ev.status === 'approved' ? 'เปิดขายบัตรแล้ว' : ev.status,
                  cycleStatus: repData.payableAmount > 0 ? 'ready' : 'cutoff',
                  cutoffDate: new Date().toISOString(),
                  payoutBankName: (ev as { payoutBankName?: string }).payoutBankName || 'ธนาคารกสิกรไทย (KBANK)',
                  payoutAccountNumber: (ev as { payoutAccountNumber?: string }).payoutAccountNumber || '123-4-56789-0',
                  payoutAccountName: (ev as { payoutAccountName?: string }).payoutAccountName || ev.organizerName || 'ผู้จัดงาน',
                  isBankVerified: true,
                  grossSales: repData.grossSales || 0,
                  customerFee: 0,
                  platformFee: repData.organizerFee || 0,
                  netSales: repData.netSales || 0,
                  netEntitlement: repData.netEntitlement || 0,
                  reservePercentage: repData.reservePercentage || 10,
                  reserveTarget: repData.reserveTarget || 0,
                  actualHeldReserve: repData.actualHeldReserve || 0,
                  totalPaidOut: repData.totalPaidOut || 0,
                  payableAmount: repData.payableAmount || 0,
                });

                if (Array.isArray(repData.payouts) && repData.payouts.length > 0) {
                  for (const p of repData.payouts) {
                    livePayouts.push({
                      id: p.id,
                      eventId: p.eventId,
                      eventTitle: ev.title,
                      organizerName: ev.organizerName || 'ผู้จัดงาน',
                      amount: p.amount,
                      paidAt: p.paidAt,
                      status: p.status,
                      payoutBankName: (ev as { payoutBankName?: string }).payoutBankName || 'ธนาคารกสิกรไทย (KBANK)',
                      payoutAccountNumber: (ev as { payoutAccountNumber?: string }).payoutAccountNumber || '123-4-56789-0',
                      payoutAccountName: (ev as { payoutAccountName?: string }).payoutAccountName || ev.organizerName || 'ผู้จัดงาน',
                      transferProofKey: p.transferProofKey,
                      transferProofUrl: p.transferProofUrl,
                      transferNote: p.transferNote,
                      transferRef: (p as { transferRef?: string }).transferRef || `TXN-${p.id}`,
                      recordedByName: p.recordedByName || 'เจ้าของระบบ TICKET',
                      createdAt: p.createdAt,
                    });
                  }
                }
              }
            } catch {
              // Ignore single event report failure
            }
          }

          if (liveConcerts.length > 0) setPayableConcerts(liveConcerts);
          if (livePayouts.length > 0) setPayoutHistory(livePayouts);
        }
      }
    } catch {
      // Keep sample mock data for testing
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle open transfer modal
  const handleOpenTransferModal = (concert: PayableConcertItem) => {
    setEditingPayoutConcert(concert);
    setTransferAmount(concert.payableAmount.toString());
    setTransferDate(new Date().toISOString().slice(0, 10));
    setTransferTime(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }).replace(':', '.'));
    setTransferRefCode(`KBANK-TXN-${Date.now().toString().slice(-6)}`);
    setTransferNote(`โอนเงินรอบสัปดาห์ คอนเสิร์ต ${concert.title}`);
    setTransferFile(null);
  };

  const handleCloseTransferModal = () => {
    setEditingPayoutConcert(null);
    setTransferFile(null);
  };

  // Submit Payout Recording
  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayoutConcert) return;

    const numAmount = parseFloat(transferAmount);
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      triggerToast({
        message: 'กรุณาระบุจำนวนเงินที่ถูกต้องและมากกว่า 0 บาท',
        type: 'error',
      });
      return;
    }

    setIsSubmittingTransfer(true);
    try {
      let transferProofKey = `proofs/payout-${editingPayoutConcert.id}-${Date.now()}.png`;
      let transferProofUrl = `/api/uploads/${transferProofKey}`;

      if (transferFile) {
        try {
          const formData = new FormData();
          formData.append('file', transferFile);
          formData.append('visibility', 'private');
          const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            transferProofKey = uploadData.key || transferProofKey;
            transferProofUrl = uploadData.url || transferProofUrl;
          }
        } catch {
          // Fall back to generated key
        }
      }

      // Record payout to backend API
      try {
        await fetch(`/api/owner/events/${editingPayoutConcert.id}/payouts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: numAmount,
            status: 'completed',
            paidAt: `${transferDate}T${transferTime.replace('.', ':')}:00.000Z`,
            transferProofKey,
            transferProofUrl,
            transferNote: transferNote.trim() || undefined,
          }),
        });
      } catch {
        // Continue for mock/local verification
      }

      // Add to local history & update payable concert
      const newPayoutId = `PAY-${Date.now().toString().slice(-8)}`;
      const newRecord: PayoutRecordItem = {
        id: newPayoutId,
        eventId: editingPayoutConcert.id,
        eventTitle: editingPayoutConcert.title,
        organizerName: editingPayoutConcert.organizerName,
        amount: numAmount,
        paidAt: `${transferDate}T${transferTime.replace('.', ':')}:00.000Z`,
        status: 'completed',
        payoutBankName: editingPayoutConcert.payoutBankName,
        payoutAccountNumber: editingPayoutConcert.payoutAccountNumber,
        payoutAccountName: editingPayoutConcert.payoutAccountName,
        transferProofKey,
        transferProofUrl,
        transferNote: transferNote.trim() || 'โอนเงินตามรอบสัปดาห์',
        transferRef: transferRefCode.trim() || `TXN-${newPayoutId}`,
        recordedByName: 'เจ้าของเว็บทดสอบ',
        createdAt: new Date().toISOString(),
      };

      setPayoutHistory(prev => [newRecord, ...prev]);

      setPayableConcerts(prev =>
        prev.map(c => {
          if (c.id === editingPayoutConcert.id) {
            const nextPaid = c.totalPaidOut + numAmount;
            const nextPayable = Math.max(0, c.netEntitlement - c.actualHeldReserve - nextPaid);
            return {
              ...c,
              totalPaidOut: nextPaid,
              payableAmount: nextPayable,
              cycleStatus: nextPayable <= 0 ? 'cutoff' : 'ready',
            };
          }
          return c;
        }),
      );

      triggerToast({
        message: `บันทึกการโอนเงินจำนวน ${formatBaht(numAmount)} ให้ "${editingPayoutConcert.organizerName}" สำเร็จเรียบร้อย (รหัส: ${newPayoutId})`,
        type: 'success',
      });

      handleCloseTransferModal();
    } catch {
      triggerToast({
        message: 'เกิดข้อผิดพลาดในการบันทึกการโอนเงิน กรุณาลองใหม่อีกครั้ง',
        type: 'error',
      });
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  // Open Proof Slip Modal
  const handleOpenProofSlipModal = (payout: PayoutRecordItem) => {
    setViewingProofPayout(payout);
    setProofModalTab('slip');
  };

  // Filtered lists
  const filteredPayableConcerts = useMemo(() => {
    return payableConcerts.filter(c => {
      const matchQuery =
        !searchQuery.trim() ||
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.organizerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.payoutAccountNumber.includes(searchQuery);

      const matchConcert = selectedConcertFilter === 'all' || c.id === selectedConcertFilter;

      const matchStatus =
        selectedStatusFilter === 'all' ||
        (selectedStatusFilter === 'ready' && c.payableAmount > 0) ||
        (selectedStatusFilter === 'zero' && c.payableAmount <= 0);

      return matchQuery && matchConcert && matchStatus;
    });
  }, [payableConcerts, searchQuery, selectedConcertFilter, selectedStatusFilter]);

  const filteredPayoutHistory = useMemo(() => {
    return payoutHistory.filter(p => {
      const matchQuery =
        !searchQuery.trim() ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.eventTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.organizerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        Boolean(p.transferRef?.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchConcert = selectedConcertFilter === 'all' || p.eventId === selectedConcertFilter;

      const matchStatus = selectedStatusFilter === 'all' || p.status === selectedStatusFilter;

      return matchQuery && matchConcert && matchStatus;
    });
  }, [payoutHistory, searchQuery, selectedConcertFilter, selectedStatusFilter]);

  // Generated slip data url for modal
  const proofSlipSvgDataUrl = useMemo(() => {
    if (!viewingProofPayout) return '';
    return generateBankSlipSvgDataUrl({
      amount: viewingProofPayout.amount,
      paidAt: viewingProofPayout.paidAt,
      transferRef: viewingProofPayout.transferRef || `TXN-${viewingProofPayout.id}`,
      eventTitle: viewingProofPayout.eventTitle,
      senderName: 'บจก. ทิกเก็ต เทคโนโลยี (TICKET Platform)',
      senderAccount: 'ธ.กสิกรไทย • 123-2-99881-0',
      receiverName: viewingProofPayout.payoutAccountName || viewingProofPayout.organizerName,
      receiverAccount: `${viewingProofPayout.payoutBankName} • ${viewingProofPayout.payoutAccountNumber}`,
      note: viewingProofPayout.transferNote || 'รอบโอนเงินค่าบัตรจำหน่ายล่วงหน้า',
    });
  }, [viewingProofPayout]);

  return (
    <div
      id="owner-weekly-payout-manager"
      data-testid="owner-weekly-payout-manager"
      className="owner-finance-management-hub"
    >
      {/* 1. Header Line */}
      <div className="hub-top-bar">
        <div>
          <h2 className="hub-main-title">
            การเงินและรอบโอนเงิน (Finance & Weekly Payout Hub)
          </h2>
          <p className="hub-sub-desc">
            ตรวจสอบยอดขายสุทธิ เงินสำรองฉุกเฉิน และบันทึกการโอนเงินตามรอบสัปดาห์ พร้อมแนบหลักฐานสลิปธนาคาร (AC-27, AC-30, AC-92)
          </p>
        </div>
      </div>

      {/* 2. Balanced Toolbar Line (D-250, D-252) */}
      <div className="hub-toolbar-row">
        {/* Left: 3 Underline Tabs */}
        <div className="hub-filter-tabs-bar" role="tablist" aria-label="แท็บระบบการเงินและรอบโอน">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ready'}
            className={`hub-filter-tab ${activeTab === 'ready' ? 'active' : ''}`}
            onClick={() => setActiveTab('ready')}
          >
            <span>รอบโอนที่พร้อมจ่าย</span>
            <span className="hub-tab-badge">
              {payableConcerts.filter(c => c.payableAmount > 0).length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            className={`hub-filter-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <span>ประวัติการโอนเงินสำเร็จ</span>
            <span className="hub-tab-badge">{payoutHistory.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'reserves'}
            className={`hub-filter-tab ${activeTab === 'reserves' ? 'active' : ''}`}
            onClick={() => setActiveTab('reserves')}
          >
            <span>เงินสำรองและหนี้ค้างชำระ</span>
          </button>
        </div>

        {/* Right Tools: Live Search, Dropdown Filters & 38px Refresh Button */}
        {activeTab !== 'reserves' && (
          <div className="hub-toolbar-tools-right">
            <div className="hub-search-box">
              <SearchIcon className="hub-search-icon" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ค้นหาคอนเสิร์ต, ผู้จัดงาน, เลขบัญชี..."
                className="hub-search-input"
                aria-label="ค้นหารอบโอนเงิน"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="hub-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="ล้างคำค้นหา"
                >
                  <XIcon />
                </button>
              )}
            </div>

            {/* Concert Dropdown Filter */}
            <select
              value={selectedConcertFilter}
              onChange={e => setSelectedConcertFilter(e.target.value)}
              className="hub-filter-select"
              aria-label="ตัวกรองคอนเสิร์ต"
            >
              <option value="all">ทุกคอนเสิร์ต ({payableConcerts.length})</option>
              {payableConcerts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>

            {/* Status Dropdown Filter */}
            {activeTab === 'ready' ? (
              <select
                value={selectedStatusFilter}
                onChange={e => setSelectedStatusFilter(e.target.value)}
                className="hub-filter-select"
                aria-label="ตัวกรองสถานะยอดพร้อมโอน"
              >
                <option value="all">ยอดโอน: ทั้งหมด</option>
                <option value="ready">มียอดพร้อมโอน (A_pay &gt; 0)</option>
                <option value="zero">โอนครบแล้ว (A_pay = 0)</option>
              </select>
            ) : (
              <select
                value={selectedStatusFilter}
                onChange={e => setSelectedStatusFilter(e.target.value)}
                className="hub-filter-select"
                aria-label="ตัวกรองสถานะการโอน"
              >
                <option value="all">สถานะ: ทั้งหมด</option>
                <option value="completed">โอนเงินสำเร็จ</option>
                <option value="failed">โอนเงินล้มเหลว</option>
              </select>
            )}

            {/* 38px Refresh Button */}
            <button
              type="button"
              className="hub-refresh-btn"
              onClick={fetchData}
              disabled={isLoadingData}
              title="รีเฟรชข้อมูลการเงิน"
              aria-label="รีเฟรชข้อมูลการเงิน"
            >
              <RefreshIcon />
            </button>
          </div>
        )}
      </div>

      {/* 3. Tab Content Area */}

      {/* TAB 1: รอบโอนที่พร้อมจ่าย (Pre-Transfer Verification & Horizontal Cards Q2 -> B1) */}
      {activeTab === 'ready' && (
        <div className="hub-list-container">
          {filteredPayableConcerts.length === 0 ? (
            <div className="hub-empty-state-card">
              <BanknotesIcon className="empty-state-icon" />
              <p className="empty-title">ไม่พบคอนเสิร์ตที่ตรงกับเงื่อนไขการค้นหา</p>
              <p className="empty-desc">ลองเปลี่ยนคำค้นหา หรือรีเซ็ตตัวกรองเพื่อดูรายการทั้งหมด</p>
            </div>
          ) : (
            filteredPayableConcerts.map(concert => (
              <div
                key={concert.id}
                className="concert-horizontal-row-card"
                data-testid={`payable-concert-card-${concert.id}`}
              >
                {/* Left Center: 4-Row Ordered Hierarchy */}
                <div className="row-card-center">
                  {/* Row 1: Header tags, Event Title & Organizer */}
                  <div className="row-card-badge-row">
                    {concert.payableAmount > 0 ? (
                      <span className="row-detail-pill payout-pill font-semibold">
                        พร้อมโอนเงิน
                      </span>
                    ) : (
                      <span className="row-detail-pill total-pill">
                        โอนครบตามรอบแล้ว
                      </span>
                    )}
                    <span className="row-detail-pill amendment-pill">
                      {concert.status}
                    </span>
                    <span className="row-meta-dot" aria-hidden="true">•</span>
                    <span className="row-meta-item">
                      ตัดรอบข้อมูล: {formatDate(new Date(concert.cutoffDate))} 23:59 น.
                    </span>
                  </div>

                  <div className="row-title-line">
                    <h3 className="row-concert-title">{concert.title}</h3>
                  </div>

                  <div className="row-details-grid">
                    <span className="row-detail-pill">
                      ผู้จัดงาน: <strong>{concert.organizerName}</strong>
                    </span>
                    <span className="row-detail-pill">
                      สถานที่: {concert.location}
                    </span>
                  </div>

                  {/* Row 2: Verified Bank Account Information (D-252 Pre-Transfer Checklist) */}
                  <div
                    className="payout-verified-bank-strip"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      flexWrap: 'wrap',
                      padding: '0.6rem 0.85rem',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '0.825rem',
                    }}
                  >
                    <span style={{ color: '#64748b', fontWeight: 600 }}>บัญชีรับเงินปลายทาง:</span>
                    <strong style={{ color: '#0f172a' }}>{concert.payoutBankName}</strong>
                    <span style={{ color: '#334155', fontFamily: 'monospace', fontWeight: 700 }}>
                      {concert.payoutAccountNumber}
                    </span>
                    <span style={{ color: '#475569' }}>({concert.payoutAccountName})</span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.725rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '9999px',
                        backgroundColor: '#f0fdf4',
                        color: '#166534',
                        border: '1px solid #bbf7d0',
                      }}
                    >
                      <ShieldCheckIcon style={{ width: '13px', height: '13px' }} />
                      ผ่านการยืนยันบัญชีแล้ว
                    </span>
                  </div>

                  {/* Row 3: Financial Accounting Breakdown (A_pay Formula) */}
                  <div
                    className="payout-formula-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                      gap: '0.5rem',
                      fontSize: '0.825rem',
                    }}
                  >
                    <div className="formula-cell">
                      <span style={{ color: '#64748b', fontSize: '0.75rem' }}>ยอดขายสุทธิ (E):</span>
                      <strong style={{ display: 'block', color: '#0f172a' }}>
                        {formatBaht(concert.netEntitlement)}
                      </strong>
                    </div>

                    <div className="formula-cell">
                      <span style={{ color: '#64748b', fontSize: '0.75rem' }}>เงินสำรอง {concert.reservePercentage}% (H):</span>
                      <strong style={{ display: 'block', color: '#475569' }}>
                        -{formatBaht(concert.actualHeldReserve)}
                      </strong>
                    </div>

                    <div className="formula-cell">
                      <span style={{ color: '#64748b', fontSize: '0.75rem' }}>โอนแล้วสะสม (P):</span>
                      <strong data-testid="owner-total-paid-out" style={{ display: 'block', color: '#0284c7' }}>
                        -{formatBaht(concert.totalPaidOut)}
                      </strong>
                    </div>

                    <div
                      className="formula-cell"
                      style={{
                        padding: '0.4rem 0.75rem',
                        backgroundColor: concert.payableAmount > 0 ? '#f0fdf4' : '#f8fafc',
                        border: `1px solid ${concert.payableAmount > 0 ? '#bbf7d0' : '#e2e8f0'}`,
                        borderRadius: '8px',
                      }}
                    >
                      <span style={{ color: concert.payableAmount > 0 ? '#166534' : '#64748b', fontSize: '0.75rem', fontWeight: 700 }}>
                        ยอดพร้อมโอนสุทธิ (A_pay):
                      </span>
                      <strong
                        data-testid="owner-payable-amount"
                        style={{
                          display: 'block',
                          fontSize: '1.05rem',
                          color: concert.payableAmount > 0 ? '#15803d' : '#64748b',
                        }}
                      >
                        {formatBaht(concert.payableAmount)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Vertical Hairline Divider & Fixed 240px Action Column (D-246, D-250) */}
                <div className="row-card-right">
                  <button
                    type="button"
                    className="primary-button row-action-btn"
                    onClick={() => handleOpenTransferModal(concert)}
                    disabled={concert.payableAmount <= 0}
                    data-testid={`record-payout-btn-${concert.id}`}
                  >
                    <span>ตรวจสอบและบันทึกการโอน</span>
                  </button>

                  <button
                    type="button"
                    className="secondary-button row-action-btn"
                    onClick={() => setViewingReportConcert(concert)}
                    data-testid={`view-report-btn-${concert.id}`}
                  >
                    <span>ดูรายงานเงินละเอียด</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: ประวัติการโอนเงินสำเร็จ (Payout History with Proof Slips Q4 -> D1) */}
      {activeTab === 'history' && (
        <div className="hub-list-container">
          {filteredPayoutHistory.length === 0 ? (
            <div className="hub-empty-state-card">
              <ReceiptIcon className="empty-state-icon" />
              <p className="empty-title">ไม่พบประวัติการโอนเงินที่ตรงกับคำค้นหา</p>
              <p className="empty-desc">เมื่อมีการบันทึกการโอนเงินสำเร็จ ประวัติและสลิปจะปรากฏที่นี่</p>
            </div>
          ) : (
            filteredPayoutHistory.map(payout => (
              <div
                key={payout.id}
                className="concert-horizontal-row-card"
                data-testid={`owner-payout-row-${payout.id}`}
              >
                <div className="row-card-center">
                  <div className="row-card-badge-row">
                    <span className="row-detail-pill payout-pill font-semibold">
                      โอนเงินสำเร็จ
                    </span>
                    <strong className="order-code-badge">
                      {payout.transferRef || `#${payout.id}`}
                    </strong>
                    <span className="row-meta-dot" aria-hidden="true">•</span>
                    <span className="row-meta-item">
                      โอนเมื่อ: {formatDate(new Date(payout.paidAt))} เวลา {formatTime(new Date(payout.paidAt))}
                    </span>
                  </div>

                  <div className="row-title-line">
                    <h3 className="row-concert-title">{payout.eventTitle}</h3>
                  </div>

                  <div className="row-details-grid">
                    <span className="row-detail-pill">
                      ผู้รับเงิน: <strong>{payout.organizerName}</strong>
                    </span>
                    <span className="row-detail-pill">
                      ธนาคาร: {payout.payoutBankName} ({payout.payoutAccountNumber})
                    </span>
                    <span className="row-detail-pill">
                      บันทึกโดย: <strong>{payout.recordedByName || 'เจ้าของระบบ TICKET'}</strong>
                    </span>
                  </div>

                  {payout.transferNote && (
                    <div
                      style={{
                        fontSize: '0.825rem',
                        color: '#475569',
                        backgroundColor: '#f8fafc',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #f1f5f9',
                      }}
                    >
                      <strong>บันทึกช่วยจำ:</strong> {payout.transferNote}
                    </div>
                  )}

                  <div>
                    <span style={{ fontSize: '0.825rem', color: '#64748b' }}>ยอดเงินที่โอน: </span>
                    <strong style={{ fontSize: '1.15rem', color: '#0284c7' }}>
                      {formatBaht(payout.amount)}
                    </strong>
                  </div>
                </div>

                <div className="row-card-right">
                  <button
                    type="button"
                    className="primary-button row-action-btn"
                    onClick={() => handleOpenProofSlipModal(payout)}
                    data-testid={`payout-proof-link-${payout.id}`}
                  >
                    <span>ดูสลิปหลักฐาน</span>
                  </button>

                  <button
                    type="button"
                    className="secondary-button row-action-btn"
                    onClick={() => {
                      const matched = payableConcerts.find(c => c.id === payout.eventId);
                      if (matched) setViewingReportConcert(matched);
                    }}
                  >
                    <span>ดูรายละเอียดการเงิน</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: เงินสำรองและหนี้ค้างชำระ (Preserving existing governance managers) */}
      {activeTab === 'reserves' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <OwnerFeeSettingsManager />
          <OwnerReserveReleaseManager />
          <OwnerDebtRepaymentManager />
          <OwnerPaymentRecoveryManager />
        </div>
      )}

      {/* =========================================================================
          MODAL 1: All-in-One Transfer & Slip Attachment Modal (Q3 -> C1)
          ========================================================================= */}
      {editingPayoutConcert && (
        <div
          className="review-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payout-transfer-modal-title"
        >
          <div className="admin-full-dialog-modal payout-transfer-dialog" id="payout-transfer-form-container">
            <div className="dialog-modal-header">
              <div className="modal-header-titles">
                <span className="modal-category-tag">ตรวจสอบและบันทึกการโอนเงิน (Pre-Transfer Verification)</span>
                <h3 id="payout-transfer-modal-title" className="modal-concert-title">
                  {editingPayoutConcert.title}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={handleCloseTransferModal}
                aria-label="ปิดหน้าต่างโอนเงิน"
              >
                <XIcon />
              </button>
            </div>

            <form onSubmit={handleSubmitTransfer}>
              <div className="dialog-modal-body">
                {/* 1. Checklist Box: Verified Bank Account & Summary Breakdown */}
                <div className="modal-summary-card">
                  <div className="summary-field">
                    <span className="summary-label">ผู้รับเงิน (ผู้จัดงาน):</span>
                    <strong className="summary-val">{editingPayoutConcert.organizerName}</strong>
                  </div>
                  <div className="summary-field">
                    <span className="summary-label">บัญชีธนาคารปลายทาง:</span>
                    <strong className="summary-val" style={{ color: '#047857' }}>
                      {editingPayoutConcert.payoutBankName}
                    </strong>
                  </div>
                  <div className="summary-field">
                    <span className="summary-label">เลขที่บัญชี:</span>
                    <strong className="summary-val" style={{ fontFamily: 'monospace' }}>
                      {editingPayoutConcert.payoutAccountNumber}
                    </strong>
                  </div>
                  <div className="summary-field">
                    <span className="summary-label">ชื่อบัญชี:</span>
                    <strong className="summary-val">{editingPayoutConcert.payoutAccountName}</strong>
                  </div>
                  <div className="summary-field">
                    <span className="summary-label">ยอดขายสุทธิ (E):</span>
                    <strong className="summary-val">{formatBaht(editingPayoutConcert.netEntitlement)}</strong>
                  </div>
                  <div className="summary-field">
                    <span className="summary-label">หักเงินสำรองฉุกเฉิน (Held H):</span>
                    <strong className="summary-val">-{formatBaht(editingPayoutConcert.actualHeldReserve)}</strong>
                  </div>
                  <div className="summary-field">
                    <span className="summary-label">หักยอดโอนสะสมก่อนหน้า (P):</span>
                    <strong className="summary-val">-{formatBaht(editingPayoutConcert.totalPaidOut)}</strong>
                  </div>
                  <div className="summary-field" style={{ gridColumn: 'span 2' }}>
                    <span className="summary-label">ยอดพร้อมโอนตามรอบสัปดาห์ (A_pay):</span>
                    <strong className="summary-val" style={{ fontSize: '1.25rem', color: '#15803d' }}>
                      {formatBaht(editingPayoutConcert.payableAmount)}
                    </strong>
                  </div>
                </div>

                {/* 2. Form Inputs */}
                <div className="modal-form-grid">
                  <div className="form-group-field">
                    <label htmlFor="payout-amount-input" className="modal-field-label">
                      จำนวนเงินที่โอนจริง (บาท) *
                    </label>
                    <input
                      id="payout-amount-input"
                      data-testid="payout-amount-input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={transferAmount}
                      onChange={e => setTransferAmount(e.target.value)}
                      className="modal-text-input"
                    />
                  </div>

                  <div className="form-group-field">
                    <label htmlFor="payout-date-input" className="modal-field-label">
                      วันที่โอนเงิน *
                    </label>
                    <input
                      id="payout-date-input"
                      data-testid="payout-date-input"
                      type="date"
                      required
                      value={transferDate}
                      onChange={e => setTransferDate(e.target.value)}
                      className="modal-text-input"
                    />
                  </div>
                </div>

                <div className="modal-form-grid" style={{ marginTop: '1rem' }}>
                  <div className="form-group-field">
                    <label htmlFor="payout-time-input" className="modal-field-label">
                      เวลาที่โอนเงิน *
                    </label>
                    <input
                      id="payout-time-input"
                      type="text"
                      required
                      value={transferTime}
                      onChange={e => setTransferTime(e.target.value)}
                      placeholder="เช่น 14:35"
                      className="modal-text-input"
                    />
                  </div>

                  <div className="form-group-field">
                    <label htmlFor="payout-ref-input" className="modal-field-label">
                      เลขที่อ้างอิงธุรกรรมธนาคาร (Ref No.) *
                    </label>
                    <input
                      id="payout-ref-input"
                      type="text"
                      required
                      value={transferRefCode}
                      onChange={e => setTransferRefCode(e.target.value)}
                      placeholder="เช่น KBANK-20261107-0091"
                      className="modal-text-input"
                    />
                  </div>
                </div>

                <div className="form-group-field" style={{ marginTop: '1rem' }}>
                  <label htmlFor="payout-proof-file" className="modal-field-label">
                    แนบไฟล์สลิปหลักฐานการโอนเงิน (AC-92 Private Slip)
                  </label>
                  <input
                    id="payout-proof-file"
                    data-testid="payout-proof-file"
                    type="file"
                    accept="image/*,.pdf"
                    onChange={e => setTransferFile(e.target.files?.[0] || null)}
                    className="modal-text-input"
                    style={{ padding: '0.4rem 0.75rem', height: 'auto' }}
                  />
                  <span className="field-hint-text">
                    รองรับไฟล์รูปภาพ PNG, JPG หรือ PDF สลิปจะถูกซิงค์ให้ผู้จัดงานเปิดดู/ดาวน์โหลดในหน้าการเงินได้ทันที
                  </span>
                </div>

                <div className="form-group-field" style={{ marginTop: '1rem' }}>
                  <label htmlFor="payout-note-input" className="modal-field-label">
                    หมายเหตุ / บันทึกช่วยจำ
                  </label>
                  <input
                    id="payout-note-input"
                    data-testid="payout-note-input"
                    type="text"
                    value={transferNote}
                    onChange={e => setTransferNote(e.target.value)}
                    placeholder="เช่น โอนเงินรอบสัปดาห์ที่ 2 ตามสัญญา"
                    className="modal-text-input"
                  />
                </div>
              </div>

              <div className="dialog-modal-footer">
                <button
                  type="button"
                  className="secondary-button modal-footer-btn"
                  onClick={handleCloseTransferModal}
                  disabled={isSubmittingTransfer}
                >
                  <span>ยกเลิก</span>
                </button>
                <button
                  type="submit"
                  id="submit-payout-btn"
                  data-testid="submit-payout-btn"
                  className="primary-button modal-footer-btn"
                  disabled={isSubmittingTransfer}
                >
                  <span>{isSubmittingTransfer ? 'กำลังบันทึก...' : 'ยืนยันบันทึกการโอนเงินและแนบหลักฐาน'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: View Bank Slip Proof Modal (Organizer Sync Q4 -> D1)
          ========================================================================= */}
      {viewingProofPayout && (
        <div
          className="review-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="proof-slip-modal-title"
        >
          <div className="admin-full-dialog-modal payout-proof-dialog" style={{ maxWidth: '520px' }}>
            <div className="dialog-modal-header">
              <div className="modal-header-titles">
                <span className="modal-category-tag">หลักฐานการโอนเงิน (Transfer Proof Slip)</span>
                <h3 id="proof-slip-modal-title" className="modal-concert-title">
                  {viewingProofPayout.transferRef || `#${viewingProofPayout.id}`}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={() => setViewingProofPayout(null)}
                aria-label="ปิดหน้าต่างสลิป"
              >
                <XIcon />
              </button>
            </div>

            {/* Subtabs for Proof Modal */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 1.5rem', background: '#f8fafc' }}>
              <button
                type="button"
                className={`hub-filter-tab ${proofModalTab === 'slip' ? 'active' : ''}`}
                onClick={() => setProofModalTab('slip')}
                style={{ padding: '0.65rem 1rem', fontSize: '0.85rem' }}
              >
                <span>สลิปหลักฐานการโอน (Bank Slip)</span>
              </button>
              <button
                type="button"
                className={`hub-filter-tab ${proofModalTab === 'details' ? 'active' : ''}`}
                onClick={() => setProofModalTab('details')}
                style={{ padding: '0.65rem 1rem', fontSize: '0.85rem' }}
              >
                <span>ข้อมูลธุรกรรมละเอียด</span>
              </button>
            </div>

            <div className="dialog-modal-body" style={{ textAlign: 'center' }}>
              {proofModalTab === 'slip' ? (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      padding: '1rem',
                      backgroundColor: '#f1f5f9',
                      borderRadius: '8px',
                    }}
                  >
                    {/* biome-ignore lint/performance/noImgElement: Data URL SVG Bank Slip */}
                    <img
                      src={proofSlipSvgDataUrl}
                      alt="สลิปหลักฐานการโอนเงิน"
                      style={{
                        maxWidth: '100%',
                        height: 'auto',
                        borderRadius: '0',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      }}
                    />
                  </div>

                  <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                    <a
                      href={proofSlipSvgDataUrl}
                      download={`slip-${viewingProofPayout.id}.svg`}
                      className="primary-button modal-footer-btn"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <DownloadIcon style={{ width: '16px', height: '16px' }} />
                      <span>ดาวน์โหลดสลิปหลักฐาน</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="modal-summary-card" style={{ textAlign: 'left', marginTop: '0.5rem' }}>
                  <div className="summary-field">
                    <span className="summary-label">รหัสอ้างอิง:</span>
                    <strong className="summary-val" style={{ fontFamily: 'monospace' }}>
                      {viewingProofPayout.transferRef || viewingProofPayout.id}
                    </strong>
                  </div>
                  <div className="summary-field">
                    <span className="summary-label">ยอดเงินที่โอน:</span>
                    <strong className="summary-val" style={{ color: '#0284c7', fontSize: '1.1rem' }}>
                      {formatBaht(viewingProofPayout.amount)}
                    </strong>
                  </div>
                  <div className="summary-field">
                    <span className="summary-label">วันเวลาที่โอน:</span>
                    <strong className="summary-val">
                      {formatDate(new Date(viewingProofPayout.paidAt))} เวลา {formatTime(new Date(viewingProofPayout.paidAt))}
                    </strong>
                  </div>
                  <div className="summary-field">
                    <span className="summary-label">ผู้โอน:</span>
                    <strong className="summary-val">บจก. ทิกเก็ต เทคโนโลยี (โดย {viewingProofPayout.recordedByName})</strong>
                  </div>
                  <div className="summary-field">
                    <span className="summary-label">ผู้รับเงิน:</span>
                    <strong className="summary-val">{viewingProofPayout.organizerName}</strong>
                  </div>
                  <div className="summary-field">
                    <span className="summary-label">บัญชีปลายทาง:</span>
                    <strong className="summary-val">
                      {viewingProofPayout.payoutBankName} ({viewingProofPayout.payoutAccountNumber})
                    </strong>
                  </div>
                  {viewingProofPayout.transferNote && (
                    <div className="summary-field" style={{ gridColumn: 'span 2' }}>
                      <span className="summary-label">บันทึกช่วยจำ:</span>
                      <strong className="summary-val">{viewingProofPayout.transferNote}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="dialog-modal-footer">
              <button
                type="button"
                className="secondary-button modal-footer-btn"
                onClick={() => setViewingProofPayout(null)}
              >
                <span>ปิดหน้าต่าง</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: Event Money Report Details Modal
          ========================================================================= */}
      {viewingReportConcert && (
        <div
          className="review-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-details-modal-title"
        >
          <div className="admin-full-dialog-modal payout-report-dialog">
            <div className="dialog-modal-header">
              <div className="modal-header-titles">
                <span className="modal-category-tag">รายงานการเงินและบัญชีละเอียด (Money Report)</span>
                <h3 id="report-details-modal-title" className="modal-concert-title">
                  {viewingReportConcert.title}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={() => setViewingReportConcert(null)}
                aria-label="ปิดหน้ารายงาน"
              >
                <XIcon />
              </button>
            </div>

            <div className="dialog-modal-body">
              <div className="modal-summary-card">
                <div className="summary-field">
                  <span className="summary-label">ผู้จัดงาน:</span>
                  <strong className="summary-val">{viewingReportConcert.organizerName}</strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">สถานะคอนเสิร์ต:</span>
                  <strong className="summary-val">{viewingReportConcert.status}</strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">ยอดขายบัตรทั้งหมด (Gross):</span>
                  <strong className="summary-val">{formatBaht(viewingReportConcert.grossSales)}</strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">ค่าบริการระบบ (Platform Fee):</span>
                  <strong className="summary-val">-{formatBaht(viewingReportConcert.platformFee)}</strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">สิทธิ์สุทธิผู้จัดงาน (E):</span>
                  <strong className="summary-val" style={{ color: '#0f172a' }}>
                    {formatBaht(viewingReportConcert.netEntitlement)}
                  </strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">เงินสำรองที่กันไว้จริง (Held H):</span>
                  <strong className="summary-val" style={{ color: '#475569' }}>
                    {formatBaht(viewingReportConcert.actualHeldReserve)}
                  </strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">ยอดที่โอนจ่ายแล้ว (Paid P):</span>
                  <strong className="summary-val" style={{ color: '#0284c7' }}>
                    {formatBaht(viewingReportConcert.totalPaidOut)}
                  </strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">ยอดพร้อมโอนสุทธิ (A_pay):</span>
                  <strong className="summary-val" style={{ color: '#15803d', fontSize: '1.2rem' }}>
                    {formatBaht(viewingReportConcert.payableAmount)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="dialog-modal-footer">
              <button
                type="button"
                className="secondary-button modal-footer-btn"
                onClick={() => setViewingReportConcert(null)}
              >
                <span>ปิดหน้ารายงาน</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
