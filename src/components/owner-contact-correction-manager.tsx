'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PaidOrderForCorrection, OrderContactAuditRecord } from '@/server/contact-correction';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import { SearchIcon, CheckCircleIcon } from './icons';
import { AlertIcon } from './alert-icon';

export function OwnerContactCorrectionManager() {
  const [orders, setOrders] = useState<PaidOrderForCorrection[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active editing order
  const [editingOrder, setEditingOrder] = useState<PaidOrderForCorrection | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Audit logs view
  const [viewingAuditOrderId, setViewingAuditOrderId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<OrderContactAuditRecord[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  const fetchOrders = useCallback(async (query = '') => {
    setIsLoading(true);
    setError(null);
    try {
      const url = query.trim()
        ? `/api/owner/orders/contact-correction?q=${encodeURIComponent(query.trim())}`
        : '/api/owner/orders/contact-correction';
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'ไม่สามารถดึงข้อมูลคำสั่งซื้อได้');
      }
      const data = await res.json();
      setOrders(data.orders || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleStartEdit = (order: PaidOrderForCorrection) => {
    setEditingOrder(order);
    setNewEmail(order.buyerEmail);
    setNewPhone(order.buyerPhone);
    setReason('');
    setError(null);
    setSuccessMessage(null);
  };

  const handleCancelEdit = () => {
    setEditingOrder(null);
    setNewEmail('');
    setNewPhone('');
    setReason('');
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;

    if (!newEmail.trim()) {
      setError('กรุณาระบุอีเมลใหม่');
      return;
    }
    if (!newPhone.trim()) {
      setError('กรุณาระบุเบอร์โทรศัพท์ใหม่');
      return;
    }
    if (!reason.trim()) {
      setError('กรุณาระบุบันทึกเหตุผลการตรวจสอบตัวตนผู้ซื้อ (G-24)');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

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

      setSuccessMessage(
        `แก้ไขข้อมูลติดต่อคำสั่งซื้อ ${editingOrder.id} สำเร็จเรียบร้อย (บันทึกประวัติรหัส ${data.auditLogId})`,
      );
      setEditingOrder(null);
      await fetchOrders();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewAuditLogs = async (orderId: string) => {
    setViewingAuditOrderId(orderId);
    setIsLoadingAudit(true);
    try {
      const res = await fetch(`/api/owner/orders/${orderId}/contact-correction`);
      if (!res.ok) {
        throw new Error('ไม่สามารถดึงประวัติการแก้ไขได้');
      }
      const data = await res.json();
      setAuditLogs(data.auditLogs || []);
    } catch {
      setAuditLogs([]);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  return (
    <div
      className="owner-contact-correction-manager"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '24px',
        marginTop: '24px',
      }}
    >
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 6px 0' }}>
          แก้ไขข้อมูลติดต่อคำสั่งซื้อที่ชำระแล้ว (AC-76, G-24)
        </h2>
        <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
          เฉพาะผู้ดูแลระบบ (Owner) ที่ตรวจสอบหลักฐานตัวตนแล้วเท่านั้นที่สามารถแก้ไขอีเมลและเบอร์โทรศัพท์ของคำสั่งซื้อที่ชำระแล้ว
          ระบบจะบันทึกประวัติการแก้ไขและสิทธิ์การค้นหาจะเปลี่ยนไปยังข้อมูลใหม่ทันที
        </p>
      </div>

      {successMessage && (
        <div
          style={{
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '6px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            color: '#166534',
          }}
        >
          <CheckCircleIcon />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            color: '#991b1b',
          }}
        >
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}

      {/* Search box */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="ค้นหาด้วยรหัสคำสั่งซื้อ, อีเมล, เบอร์โทร, หรือชื่องาน..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') fetchOrders(searchTerm);
          }}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            fontSize: '14px',
          }}
        />
        <button
          type="button"
          onClick={() => fetchOrders(searchTerm)}
          disabled={isLoading}
          style={{
            backgroundColor: '#0f172a',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <SearchIcon />
          ค้นหา
        </button>
        <button
          type="button"
          onClick={() => {
            setSearchTerm('');
            fetchOrders('');
          }}
          disabled={isLoading}
          style={{
            backgroundColor: '#f1f5f9',
            color: '#475569',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            padding: '8px 14px',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          รีเซ็ต
        </button>
      </div>

      {/* Editing Form Modal / Inline Box */}
      {editingOrder && (
        <div
          id="contact-edit-form-container"
          style={{
            backgroundColor: '#f8fafc',
            border: '2px solid #1848ed',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 12px 0' }}>
            แก้ไขข้อมูลติดต่อคำสั่งซื้อ: {editingOrder.id}
          </h3>

          <div
            style={{
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              padding: '10px 14px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#1e40af',
            }}
          >
            ผู้ซื้อปัจจุบัน: <strong>{editingOrder.buyerName}</strong> | อีเมลเดิม:{' '}
            <strong>{editingOrder.buyerEmail}</strong> | เบอร์โทรเดิม:{' '}
            <strong>{editingOrder.buyerPhone}</strong>
          </div>

          <form onSubmit={handleSubmitEdit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label
                  htmlFor="new-buyer-email"
                  style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}
                >
                  อีเมลใหม่ *
                </label>
                <input
                  id="new-buyer-email"
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="new-buyer-phone"
                  style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}
                >
                  เบอร์โทรศัพท์ใหม่ *
                </label>
                <input
                  id="new-buyer-phone"
                  type="tel"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="correction-reason"
                style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}
              >
                บันทึกเหตุผลและการตรวจสอบตัวตน (G-24) *
              </label>
              <textarea
                id="correction-reason"
                rows={2}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="เช่น ตรวจสอบสำเนาบัตรประชาชนและสลิปการโอนเงินยืนยันความเป็นเจ้าของคำสั่งซื้อถูกต้องแล้ว"
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 18px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกการแก้ไขข้อมูล'}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isSubmitting}
                style={{
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Orders Table */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
          กำลังโหลดรายการคำสั่งซื้อ...
        </div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
          ไม่พบรายการคำสั่งซื้อที่ชำระแล้วที่ตรงกับเงื่อนไข
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', color: '#475569' }}>รหัสคำสั่งซื้อ</th>
                <th style={{ padding: '10px 12px', color: '#475569' }}>คอนเสิร์ต</th>
                <th style={{ padding: '10px 12px', color: '#475569' }}>ผู้ซื้อ</th>
                <th style={{ padding: '10px 12px', color: '#475569' }}>อีเมล</th>
                <th style={{ padding: '10px 12px', color: '#475569' }}>เบอร์โทรศัพท์</th>
                <th style={{ padding: '10px 12px', color: '#475569' }}>ยอดเงิน</th>
                <th style={{ padding: '10px 12px', color: '#475569' }}>จำนวนบัตร</th>
                <th style={{ padding: '10px 12px', color: '#475569', textAlign: 'right' }}>การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 'bold', color: '#0f172a' }}>
                    {order.id}
                  </td>
                  <td style={{ padding: '12px', color: '#334155' }}>
                    <div style={{ fontWeight: 'bold' }}>{order.eventTitle}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      {formatDate(new Date(order.sessionStartTime))}
                    </div>
                  </td>
                  <td style={{ padding: '12px', color: '#334155' }}>{order.buyerName}</td>
                  <td style={{ padding: '12px', color: '#1848ed', fontWeight: 'bold' }}>
                    <span id={`buyer-email-${order.id}`}>{order.buyerEmail}</span>
                  </td>
                  <td style={{ padding: '12px', color: '#334155' }}>
                    <span id={`buyer-phone-${order.id}`}>{order.buyerPhone}</span>
                  </td>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: '#0f172a' }}>
                    {formatBaht(order.total)}
                  </td>
                  <td style={{ padding: '12px', color: '#475569' }}>{order.ticketCount} ใบ</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <button
                        type="button"
                        id={`edit-contact-btn-${order.id}`}
                        onClick={() => handleStartEdit(order)}
                        style={{
                          backgroundColor: '#eff6ff',
                          color: '#1848ed',
                          border: '1px solid #bfdbfe',
                          borderRadius: '4px',
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                        }}
                      >
                        แก้ไขข้อมูล
                      </button>
                      <button
                        type="button"
                        id={`view-audit-btn-${order.id}`}
                        onClick={() => handleViewAuditLogs(order.id)}
                        style={{
                          backgroundColor: '#ffffff',
                          color: '#64748b',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        ประวัติ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Audit Logs Viewer Modal */}
      {viewingAuditOrderId && (
        <div
          id="audit-log-viewer"
          style={{
            marginTop: '20px',
            backgroundColor: '#fafafa',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
              ประวัติการแก้ไขข้อมูลติดต่อสำหรับคำสั่งซื้อ: {viewingAuditOrderId}
            </h4>
            <button
              type="button"
              onClick={() => setViewingAuditOrderId(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              ปิด
            </button>
          </div>

          {isLoadingAudit ? (
            <div style={{ color: '#64748b', fontSize: '13px' }}>กำลังโหลดประวัติ...</div>
          ) : auditLogs.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '13px' }}>
              ยังไม่เคยมีการแก้ไขข้อมูลติดต่อสำหรับคำสั่งซื้อนี้
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {auditLogs.map(log => (
                <div
                  key={log.id}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '10px 14px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginBottom: '4px' }}>
                    <span>
                      ผู้แก้ไข: <strong>{log.correctedByName}</strong> (Owner)
                    </span>
                    <span>
                      {formatDate(new Date(log.createdAt))} เวลา {formatTime(new Date(log.createdAt))}
                    </span>
                  </div>
                  <div style={{ color: '#334155', marginBottom: '4px' }}>
                    อีเมลเดิม: <code>{log.previousEmail}</code> &rarr; อีเมลใหม่: <strong>{log.newEmail}</strong>
                  </div>
                  <div style={{ color: '#334155', marginBottom: '4px' }}>
                    เบอร์โทรเดิม: <code>{log.previousPhone}</code> &rarr; เบอร์โทรใหม่: <strong>{log.newPhone}</strong>
                  </div>
                  <div style={{ color: '#475569', fontStyle: 'italic' }}>
                    เหตุผลการตรวจสอบ: &quot;{log.reason}&quot;
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
