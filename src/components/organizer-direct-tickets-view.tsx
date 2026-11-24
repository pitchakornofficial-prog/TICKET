'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  DirectIssuanceEventOption,
  DirectTicketBatchSummary,
} from '@/server/direct-tickets';
import type { TicketDetail } from '@/server/tickets';
import {
  downloadTicketAsPng,
  downloadAllTicketsAsZip,
} from '@/components/ticket-canvas-download';
import { triggerToast, triggerRefreshToast } from '@/components/toast-notification';
import {
  SearchIcon,
  RefreshIcon,
  DownloadIcon,
  XIcon,
  ReceiptIcon,
  EyeIcon,
  QrCodeIcon,
} from '@/components/icons';
import { formatDate, formatTime } from '@/lib/locale';

export function OrganizerDirectTicketsView() {
  const [isLoading, setIsLoading] = useState(false);
  const [eventsOptions, setEventsOptions] = useState<DirectIssuanceEventOption[]>([]);
  const [batches, setBatches] = useState<DirectTicketBatchSummary[]>([]);
  const [totalBatches, setTotalBatches] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEventId, setFilterEventId] = useState('all');

  // Detail Modal
  const [viewingBatch, setViewingBatch] = useState<DirectTicketBatchSummary | null>(null);
  const [batchTickets, setBatchTickets] = useState<TicketDetail[]>([]);
  const [isLoadingBatchTickets, setIsLoadingBatchTickets] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadingRowId, setDownloadingRowId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterEventId !== 'all') params.set('eventId', filterEventId);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/organizer/direct-tickets?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้');
      const data = await res.json();
      setEventsOptions(data.eventsOptions || data.options || []);
      setBatches(data.batches || []);
      setTotalBatches(data.total || 0);
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้',
      });
    } finally {
      setIsLoading(false);
    }
  }, [filterEventId, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenBatch = async (orderId: string) => {
    setIsLoadingBatchTickets(true);
    try {
      const res = await fetch(`/api/organizer/direct-tickets/${orderId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('ไม่สามารถโหลดรายละเอียดบัตรได้');
      const data = await res.json();
      setViewingBatch(data.batch);
      setBatchTickets(data.tickets || []);
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถโหลดรายละเอียดได้',
      });
    } finally {
      setIsLoadingBatchTickets(false);
    }
  };

  const handleDirectRowZipDownload = async (batch: DirectTicketBatchSummary) => {
    setDownloadingRowId(batch.orderId);
    try {
      const res = await fetch(`/api/organizer/direct-tickets/${batch.orderId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('ไม่สามารถโหลดรายการบัตรได้');
      const data = await res.json();
      const tickets: TicketDetail[] = data.tickets || [];
      if (tickets.length === 0) throw new Error('ไม่พบข้อมูลบัตรในรายการนี้');
      const zipName = `direct-tickets-${batch.orderId}`;
      await downloadAllTicketsAsZip(tickets, zipName, {
        priceDisplayMode: batch.priceDisplayMode,
      });
      triggerToast({
        type: 'success',
        message: `ดาวน์โหลดไฟล์ .zip (${tickets.length} ใบ + CSV) เรียบร้อยแล้ว`,
      });
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสร้างไฟล์ .zip',
      });
    } finally {
      setDownloadingRowId(null);
    }
  };

  const handleDownloadZip = async () => {
    if (!viewingBatch || batchTickets.length === 0) return;
    setZipProgress({ current: 0, total: batchTickets.length });
    try {
      const zipName = `direct-tickets-${viewingBatch.orderId}`;
      await downloadAllTicketsAsZip(batchTickets, zipName, {
        priceDisplayMode: viewingBatch.priceDisplayMode,
        onProgress: (current, total) => setZipProgress({ current, total }),
      });
      triggerToast({
        type: 'success',
        message: `ดาวน์โหลดไฟล์ .zip ทั้งหมด ${batchTickets.length} ใบเรียบร้อยแล้ว`,
      });
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสร้างไฟล์ .zip',
      });
    } finally {
      setZipProgress(null);
    }
  };

  const visibleBatches = useMemo(() => batches, [batches]);

  const handleManualRefresh = async () => {
    await loadData();
    triggerRefreshToast('ออกบัตรตรง');
  };

  return (
    <div className="direct-tickets-container">
      {/* 1. Standard Top Bar */}
      <div className="hub-top-bar">
        <div className="hub-header-left">
          <h2 className="pipeline-title">บัตรที่ดึงออกตรง (Direct Issued Tickets)</h2>
          <p className="pipeline-subtitle">
            รายการบัตรที่เจ้าของระบบจัดสรรจากโควตา (กรณีโอนตรงนอกระบบ) ตรวจสอบโควตาแยกและดาวน์โหลดรูปบัตรหรือไฟล์ .zip ได้
          </p>
        </div>
        <div className="hub-toolbar-tools-right">
          <button
            type="button"
            className="secondary-button hub-refresh-btn"
            onClick={handleManualRefresh}
            disabled={isLoading}
            aria-label="รีเฟรชข้อมูล"
            title="รีเฟรชข้อมูล"
          >
            <RefreshIcon className={`btn-icon ${isLoading ? 'spinning' : ''}`} style={{ width: 16, height: 16 }} />
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* 2. Quota Overview Cards per Event & Session */}
      <div className="direct-tickets-container">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '-0.35rem' }}>
          <ReceiptIcon style={{ width: 18, height: 18, color: '#0f172a' }} />
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 400, color: '#0f172a' }}>
            สรุปการจัดสรรโควตาแยกแต่ละรอบการแสดง
          </h3>
        </div>

        {eventsOptions.map(ev => (
          <section key={ev.eventId} className="direct-section-card">
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', fontWeight: 400, color: '#0f172a' }}>
              {ev.eventTitle}
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {ev.sessions.map(s => (
                <div
                  key={s.sessionId}
                  style={{
                    background: '#fafafa',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: '1rem',
                  }}
                >
                  <div style={{ fontSize: '0.86rem', fontWeight: 400, color: '#334155', marginBottom: '0.75rem' }}>
                    รอบการแสดง: {formatDate(new Date(s.startTime))} เวลา {formatTime(new Date(s.startTime))}
                  </div>

                  <div className="direct-table-wrap">
                    <table className="direct-data-table" style={{ minWidth: 580 }}>
                      <thead>
                        <tr>
                          <th>ประเภทบัตร (Tier / Zone)</th>
                          <th className="align-right">โควตาทั้งหมด</th>
                          <th className="align-right">ขายผ่านเว็บ</th>
                          <th className="align-right">ดึงออกตรงสะสม</th>
                          <th className="align-center">คงเหลือที่เปิดขาย</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.ticketTypes.map(tt => (
                          <tr key={tt.ticketTypeId}>
                            <td>
                              <strong>{tt.name}</strong>
                            </td>
                            <td className="align-right">{tt.quota.toLocaleString()}</td>
                            <td className="align-right" style={{ color: '#64748b' }}>
                              {tt.webSold.toLocaleString()}
                            </td>
                            <td className="align-right" style={{ fontWeight: 400, color: '#0f172a' }}>
                              {tt.directIssued.toLocaleString()}
                            </td>
                            <td className="align-center">
                              {tt.available <= 0 ? (
                                <span className="direct-status-badge revoked">หมด (0 ใบ)</span>
                              ) : tt.available <= 10 ? (
                                <span className="direct-status-badge warning">เหลือ {tt.available} ใบ</span>
                              ) : (
                                <span className="direct-status-badge valid">
                                  คงเหลือ {tt.available.toLocaleString()} ใบ
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {eventsOptions.length === 0 && (
          <div className="hub-empty-state-card">
            <p className="empty-title">ไม่มีรอบการแสดงที่เปิดขายในขณะนี้</p>
          </div>
        )}
      </div>

      {/* 3. Batches History Section */}
      <section className="direct-section-card" style={{ marginTop: '0.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.15rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="hub-search-box">
              <SearchIcon className="hub-search-icon" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ค้นหารหัส #DIR-, หมายเหตุ..."
                className="hub-search-input"
                aria-label="ค้นหารายการออกบัตรตรง"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="hub-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="ล้างการค้นหา"
                >
                  <XIcon style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>

            <select
              value={filterEventId}
              onChange={e => setFilterEventId(e.target.value)}
              className="hub-sort-select"
              aria-label="กรองตามคอนเสิร์ต"
            >
              <option value="all">ทุกคอนเสิร์ต</option>
              {eventsOptions.map(ev => (
                <option key={ev.eventId} value={ev.eventId}>
                  {ev.eventTitle}
                </option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: '0.84rem', color: '#64748b' }}>
            พบ <strong>{totalBatches}</strong> รายการ
          </div>
        </div>

        {/* Batches Table */}
        <div className="direct-table-wrap">
          <table className="direct-data-table">
            <thead>
              <tr>
                <th>รหัสรายการ</th>
                <th>คอนเสิร์ต / รอบการแสดง</th>
                <th>ผู้รับมอบ / หลักฐานอ้างอิง</th>
                <th className="align-right">จำนวนบัตร</th>
                <th className="align-center">สถานะการเข้างาน</th>
                <th>วันที่ออกบัตร / วันที่เพิกถอน</th>
                <th className="align-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {visibleBatches.map(batch => {
                const isFullyRevoked = batch.cancelledTickets === batch.totalTickets && batch.totalTickets > 0;
                const isDownloadingRow = downloadingRowId === batch.orderId;
                return (
                  <tr key={batch.orderId}>
                    <td className="nowrap-cell">
                      <span className="direct-order-code">#{batch.orderId}</span>
                    </td>
                    <td className="nowrap-cell">
                      <span style={{ color: '#0f172a', fontWeight: 400 }}>{batch.eventTitle}</span>
                      <span style={{ color: '#94a3b8', margin: '0 0.35rem' }}>•</span>
                      <span style={{ color: '#64748b', fontSize: '0.76rem' }}>
                        {formatDate(new Date(batch.sessionStartTime))} {formatTime(new Date(batch.sessionStartTime))}
                      </span>
                    </td>
                    <td className="nowrap-cell">
                      <span style={{ color: '#0f172a', fontWeight: 400 }}>{batch.buyerName}</span>
                      {batch.referenceNote && (
                        <span style={{ color: '#475569', fontSize: '0.74rem', marginLeft: '0.35rem' }}>
                          ({batch.referenceNote})
                        </span>
                      )}
                    </td>
                    <td className="align-right nowrap-cell">
                      <span style={{ color: '#0f172a', fontWeight: 400 }}>{batch.totalTickets} ใบ</span>
                    </td>
                    <td className="align-center nowrap-cell">
                      {isFullyRevoked ? (
                        <span className="direct-status-badge revoked">
                          <span>เพิกถอนแล้ว</span>
                        </span>
                      ) : (
                        <>
                          <span className="direct-status-badge valid">
                            <span>{batch.admittedTickets} เข้างานแล้ว</span>
                          </span>
                          {batch.cancelledTickets > 0 && (
                            <span className="direct-status-badge revoked" style={{ marginLeft: 6 }}>
                              <span>{batch.cancelledTickets} เพิกถอน</span>
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="nowrap-cell" style={{ fontSize: '0.76rem' }}>
                      {isFullyRevoked && batch.revokedAt ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <span style={{ color: '#dc2626', fontWeight: 400 }}>
                            เพิกถอน: {formatDate(new Date(batch.revokedAt))} {formatTime(new Date(batch.revokedAt))}
                          </span>
                          <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>
                            ออกบัตร: {formatDate(new Date(batch.createdAt))}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#64748b' }}>
                          {formatDate(new Date(batch.createdAt))}
                        </span>
                      )}
                    </td>
                    <td className="align-center nowrap-cell">
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenBatch(batch.orderId)}
                          className="secondary-button direct-btn-sm"
                          style={{ height: 32, minHeight: 32, maxHeight: 32, boxSizing: 'border-box' }}
                        >
                          <EyeIcon style={{ width: 13, height: 13 }} />
                          <span>รายละเอียด</span>
                        </button>

                        {!isFullyRevoked && (
                          <button
                            type="button"
                            onClick={() => handleDirectRowZipDownload(batch)}
                            disabled={isDownloadingRow}
                            className="secondary-button direct-btn-sm"
                            style={{ height: 32, minHeight: 32, maxHeight: 32, boxSizing: 'border-box' }}
                          >
                            <DownloadIcon style={{ width: 13, height: 13 }} />
                            <span>{isDownloadingRow ? 'กำลังโหลด...' : '.ZIP'}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleBatches.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                    {isLoading ? 'กำลังโหลดข้อมูล...' : 'ไม่พบประวัติรายการออกบัตรตรงของงานท่าน'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detail Popup Modal */}
      {viewingBatch && (
        <div
          className="direct-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="organizer-modal-title"
        >
          <div className="direct-modal-card wide">
            <div className="direct-modal-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span className="direct-order-code" style={{ fontSize: '1.05rem', fontWeight: 400 }}>
                    #{viewingBatch.orderId}
                  </span>
                  <h3 id="organizer-modal-title" className="direct-modal-title" style={{ fontSize: '1.05rem', fontWeight: 400, margin: 0 }}>
                    {viewingBatch.eventTitle}
                  </h3>
                </div>
                <p className="direct-modal-subtitle">รายการบัตรและหลักฐานการจัดสรรจากโควตาคอนเสิร์ต</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setViewingBatch(null)}
                aria-label="ปิดหน้าต่าง"
              >
                <XIcon style={{ width: 18, height: 18 }} />
              </button>
            </div>

            <div className="direct-modal-body">
              {isLoadingBatchTickets ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  <RefreshIcon className="spinning" style={{ width: 24, height: 24, margin: '0 auto 0.5rem' }} />
                  <p>กำลังโหลดรายละเอียดรายการบัตร...</p>
                </div>
              ) : (
                <>
                  <div className="direct-evidence-grid">
                    <div className="direct-evidence-item">
                      <span className="direct-evidence-label">รอบการแสดง</span>
                      <span className="direct-evidence-value">
                        {formatDate(new Date(viewingBatch.sessionStartTime))}{' '}
                        {formatTime(new Date(viewingBatch.sessionStartTime))}
                      </span>
                    </div>
                    <div className="direct-evidence-item">
                      <span className="direct-evidence-label">ผู้รับมอบ</span>
                      <span className="direct-evidence-value">
                        {viewingBatch.buyerName} ({viewingBatch.buyerEmail})
                      </span>
                    </div>
                    <div className="direct-evidence-item">
                      <span className="direct-evidence-label">
                        {viewingBatch.cancelledTickets > 0 && viewingBatch.validTickets === 0
                          ? 'ผู้เพิกถอน / วันที่เพิกถอน'
                          : viewingBatch.cancelledTickets > 0
                            ? 'ผู้ออกบัตร / วันที่ออกบัตร / วันที่เพิกถอน'
                            : 'ผู้ออกบัตร / วันที่ออกบัตร'}
                      </span>
                      <span className="direct-evidence-value">{viewingBatch.issuedByName || 'Owner'}</span>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        ออกบัตร: {formatDate(new Date(viewingBatch.createdAt))}{' '}
                        {formatTime(new Date(viewingBatch.createdAt))}
                        {viewingBatch.revokedAt && (
                          <>
                            <br />
                            <span style={{ color: '#dc2626' }}>
                              เพิกถอน: {formatDate(new Date(viewingBatch.revokedAt))}{' '}
                              {formatTime(new Date(viewingBatch.revokedAt))}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="direct-evidence-item">
                      <span className="direct-evidence-label">รูปแบบราคา</span>
                      <span className="direct-evidence-value">
                        {viewingBatch.priceDisplayMode === 'complimentary'
                          ? 'บัตรเชิญ (COMPLIMENTARY)'
                          : 'แสดงราคาจริง'}
                      </span>
                    </div>
                    <div className="direct-evidence-item" style={{ gridColumn: '1 / -1' }}>
                      <span className="direct-evidence-label">หลักฐาน / หมายเหตุอ้างอิง</span>
                      <span className="direct-evidence-value">{viewingBatch.referenceNote || '-'}</span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 400, color: '#0f172a' }}>
                      รายการบัตรทั้งหมด ({batchTickets.length} ใบ)
                    </h4>
                    {batchTickets.length > 0 && (batchTickets.every(t => t.status === 'cancelled') || (viewingBatch.validTickets === 0 && viewingBatch.cancelledTickets > 0)) ? (
                      <span style={{ color: '#dc2626', fontSize: '0.82rem', padding: '0.2rem 0' }}>
                        ชุดบัตรนี้ถูกเพิกถอนสิทธิ์แล้วทั้งหมด (ไม่อนุญาตให้ดาวน์โหลดไฟล์)
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="primary-button direct-btn-sm"
                        style={{ height: 32, minHeight: 32, maxHeight: 32, boxSizing: 'border-box' }}
                        onClick={handleDownloadZip}
                        disabled={Boolean(zipProgress) || batchTickets.length === 0}
                      >
                        <DownloadIcon style={{ width: 13, height: 13 }} />
                        <span>
                          {zipProgress
                            ? `กำลังแพ็ก ZIP (${zipProgress.current}/${zipProgress.total})...`
                            : 'ดาวน์โหลดทั้งหมด (.ZIP + CSV)'}
                        </span>
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {batchTickets.map((t, idx) => {
                      const isAdmitted = t.admissionStatus === 'inside' || t.status === 'used';
                      const isCancelled = t.status === 'cancelled';
                      return (
                        <div key={t.id} className="direct-ticket-row">
                          <div className="direct-ticket-row-left">
                            <span style={{ fontSize: '0.78rem', color: '#94a3b8', width: 24 }}>#{idx + 1}</span>
                            <span className="direct-ticket-code">{t.ticketCode}</span>
                            <span style={{ fontSize: '0.84rem', color: '#475569' }}>
                              ประเภท: <strong>{t.ticketTypeName}</strong>
                            </span>
                            {isAdmitted ? (
                              <span className="direct-status-badge valid">
                                <QrCodeIcon style={{ width: 13, height: 13 }} />
                                <span>เข้างานแล้ว</span>
                              </span>
                            ) : isCancelled ? (
                              <span className="direct-status-badge revoked">เพิกถอนแล้ว</span>
                            ) : (
                              <span className="direct-status-badge valid">พร้อมใช้งาน</span>
                            )}
                          </div>

                          {!isCancelled ? (
                            <button
                              type="button"
                              className="secondary-button direct-btn-sm"
                              style={{ height: 32, minHeight: 32, maxHeight: 32, boxSizing: 'border-box' }}
                              onClick={() => downloadTicketAsPng(t)}
                            >
                              <DownloadIcon style={{ width: 13, height: 13 }} />
                              <span>PNG</span>
                            </button>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>สิทธิ์ถูกเพิกถอน</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="direct-modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setViewingBatch(null)}
                style={{ minHeight: 38, padding: '0.45rem 1rem' }}
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
