'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AdmissionSyncConflictItem } from '@/server/admission';
import { formatTime, formatDate } from '@/lib/locale';
import { RefreshIcon, CheckCircleIcon, ClockIcon } from './icons';

export function OwnerSyncConflictManager() {
  const [conflicts, setConflicts] = useState<AdmissionSyncConflictItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchConflicts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/owner/sync-conflicts', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setConflicts(data.conflicts || []);
      } else {
        const data = await res.json();
        setError(data.message || 'ไม่สามารถดึงรายการข้อขัดแย้งการซิงก์ได้');
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConflicts();
  }, [fetchConflicts]);

  async function handleResolve(conflictId: string) {
    setResolvingId(conflictId);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/owner/sync-conflicts/${conflictId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionNotes: 'เจ้าของเว็บตรวจสอบและรับทราบข้อขัดแย้งการสแกนแล้ว' }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({ type: 'success', text: data.message || 'ปิดข้อขัดแย้งเรียบร้อยแล้ว' });
        fetchConflicts();
      } else {
        setActionMessage({ type: 'error', text: data.message || 'เกิดข้อผิดพลาดในการปิดข้อขัดแย้ง' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
    } finally {
      setResolvingId(null);
    }
  }

  const pendingCount = conflicts.filter(c => c.status === 'pending_review').length;

  return (
    <section
      className="form-card"
      id="owner-sync-conflicts-manager"
      data-testid="owner-sync-conflicts-manager"
      aria-labelledby="sync-conflicts-heading"
      style={{ marginTop: '24px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
        <div>
          <h2 id="sync-conflicts-heading" style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b' }}>
            รายการข้อขัดแย้งการซิงก์ออฟไลน์ (Offline Admission Conflicts — AC-99)
          </h2>
          <p className="card-caption">
            รายการบัตรที่ถูกสแกนออฟไลน์ แต่ถูกเพิกถอนหรือคืนเงินในระบบกลางระหว่างที่เครื่องหลักออฟไลน์ (G-44)
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            data-testid="pending-conflicts-badge"
            className={`status-badge ${pendingCount > 0 ? 'pending' : 'approved'}`}
          >
            {pendingCount > 0 ? `รอตรวจสอบ ${pendingCount} รายการ` : 'ไม่มีข้อขัดแย้งค้างตรวจ'}
          </span>
          <button
            type="button"
            className="secondary-button mini-btn"
            onClick={fetchConflicts}
            disabled={loading}
            title="รีเฟรชรายการข้อขัดแย้ง"
            style={{ padding: '4px 8px' }}
          >
            <RefreshIcon className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className={`status-banner ${actionMessage.type}`} role="status" style={{ marginBottom: '14px' }}>
          <span>{actionMessage.text}</span>
        </div>
      )}

      {error && (
        <div className="status-banner error" role="alert" style={{ marginBottom: '14px' }}>
          <span>{error}</span>
        </div>
      )}

      {conflicts.length === 0 ? (
        <div className="empty-sub-card">
          <CheckCircleIcon />
          <p>ยังไม่มีข้อขัดแย้งการซิงก์ออฟไลน์ในระบบ</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="logs-table" id="sync-conflicts-table">
            <thead>
              <tr>
                <th>เวลาสแกน</th>
                <th>งานคอนเสิร์ต / รอบ</th>
                <th>รหัสบัตร</th>
                <th>การดำเนินการ</th>
                <th>ผู้สแกน</th>
                <th>รายละเอียดข้อขัดแย้ง</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map(c => (
                <tr key={c.id} id={`conflict-row-${c.id}`} className={c.status === 'pending_review' ? 'log-rejected' : ''}>
                  <td className="font-mono text-xs whitespace-nowrap">
                    <ClockIcon className="inline-icon" />
                    {formatDate(new Date(c.scannedAt))} {formatTime(new Date(c.scannedAt))}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{c.eventTitle}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      {formatTime(new Date(c.sessionStartTime))} – {formatTime(new Date(c.sessionEndTime))}
                    </div>
                  </td>
                  <td className="font-mono font-bold text-xs" data-testid={`conflict-ticket-code-${c.id}`}>{c.ticketCode}</td>
                  <td>
                    <span className={`mini-badge ${c.action === 'entry' ? 'badge-entry' : 'badge-exit'}`}>
                      {c.action === 'entry' ? 'เข้างาน' : 'ออกงาน'}
                    </span>
                  </td>
                  <td className="text-xs text-slate-600">{c.scannerName}</td>
                  <td className="text-xs">
                    <strong style={{ color: '#b91c1c' }}>{c.conflictType}</strong>
                    <div style={{ color: '#475569', fontSize: '11px' }}>{c.conflictDetails}</div>
                  </td>
                  <td>
                    <span
                      data-testid={`conflict-status-${c.id}`}
                      className={`status-badge mini ${c.status === 'resolved' ? 'approved' : 'pending'}`}
                    >
                      {c.status === 'resolved' ? 'รับทราบแล้ว' : 'รอตรวจสอบ'}
                    </span>
                  </td>
                  <td>
                    {c.status === 'pending_review' ? (
                      <button
                        type="button"
                        id={`resolve-conflict-btn-${c.id}`}
                        data-testid={`resolve-conflict-btn-${c.id}`}
                        className="button button-primary mini-btn"
                        onClick={() => handleResolve(c.id)}
                        disabled={resolvingId === c.id}
                        style={{ fontSize: '12px', padding: '3px 8px' }}
                      >
                        {resolvingId === c.id ? 'กำลังบันทึก...' : 'รับทราบและปิดข้อขัดแย้ง'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">ปิดแล้ว ({c.resolvedBy || '-'})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
