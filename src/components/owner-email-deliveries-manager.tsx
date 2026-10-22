'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import type { TicketEmailDeliveryRecord } from '@/server/ticket-delivery';
import { AlertIcon } from './alert-icon';
import { CheckCircleIcon, RefreshIcon } from './icons';

export function OwnerEmailDeliveriesManager() {
  const [deliveries, setDeliveries] = useState<TicketEmailDeliveryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadDeliveries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/owner/failed-email-deliveries');
      if (!res.ok) {
        throw new Error('โหลดรายการส่งอีเมลไม่สำเร็จ');
      }
      const data = await res.json();
      setDeliveries(data.deliveries || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  function handleRetry(deliveryId: string) {
    setError(null);
    setSuccessMessage(null);
    startTransition(async () => {
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
        setSuccessMessage(`ส่งอีเมลสำหรับรายการ ${deliveryId} สำเร็จเรียบร้อยแล้ว`);
        await loadDeliveries();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลองส่งใหม่');
      }
    });
  }

  return (
    <section
      className="account-card"
      style={{
        marginTop: '2rem',
        background: 'var(--white)',
        border: '1px solid var(--line)',
        borderRadius: '8px',
        padding: '1.8rem',
      }}
      aria-labelledby="email-deliveries-title"
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.2rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
            <AlertIcon />
            <h2 id="email-deliveries-title" style={{ margin: 0, fontSize: '1.25rem' }}>
              การจัดส่งอีเมลบัตรที่ล้มเหลว (AC-20, AC-75)
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)' }}>
            ตรวจสอบและลองส่งอีเมลบัตรใหม่สำหรับคำสั่งซื้อที่จัดส่งไม่สำเร็จ โดยไม่กระทบสถานะชำระเงินหรือออกบัตรซ้ำ
          </p>
        </div>
        <button
          type="button"
          onClick={loadDeliveries}
          disabled={isLoading}
          className="action-button"
          style={{
            minHeight: '38px',
            padding: '0.5rem 1.2rem',
            background: 'var(--white)',
            border: '1px solid var(--line)',
            borderRadius: '4px',
            fontWeight: 500,
            fontSize: '0.85rem',
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? 'กำลังโหลด...' : 'รีเฟรช'}
        </button>
      </div>

      {successMessage && (
        <div
          role="status"
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '6px',
            padding: '0.8rem 1rem',
            marginBottom: '1rem',
            color: '#166534',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <CheckCircleIcon style={{ width: '18px', height: '18px', flexShrink: 0 }} />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '0.8rem 1rem',
            marginBottom: '1rem',
            color: '#991b1b',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      {deliveries.length === 0 && !isLoading ? (
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            color: 'var(--muted)',
            background: '#fafafb',
            borderRadius: '6px',
            fontSize: '0.95rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <CheckCircleIcon style={{ width: '28px', height: '28px', color: '#16a34a' }} />
          </div>
          ไม่มีรายการจัดส่งอีเมลที่ล้มเหลว ทุกคำสั่งซื้อจัดส่งสำเร็จเรียบร้อย
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {deliveries.map((d, idx) => (
            <div
              key={d.id}
              className="failed-delivery-card"
              style={{
                border: '1px solid #fecaca',
                background: '#fff5f5',
                borderRadius: '8px',
                padding: '1.2rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '0.8rem',
                  marginBottom: '0.8rem',
                  paddingBottom: '0.8rem',
                  borderBottom: '1px solid #fee2e2',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <span
                      style={{
                        background: '#fee2e2',
                        color: '#991b1b',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      จัดส่งล้มเหลว
                    </span>
                    <strong id={`delivery-id-${idx}`} style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      {d.id}
                    </strong>
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
                    คำสั่งซื้อ: <strong id={`delivery-order-${idx}`}>{d.orderId}</strong> {d.eventTitle ? `(${d.eventTitle})` : ''}
                  </div>
                </div>

                <button
                  type="button"
                  id={`retry-delivery-btn-${idx}`}
                  disabled={isPending}
                  onClick={() => handleRetry(d.id)}
                  className="action-button"
                  style={{
                    minHeight: '36px',
                    padding: '0.4rem 1rem',
                    background: 'var(--blue)',
                    color: 'var(--white)',
                    border: 'none',
                    borderRadius: '4px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: isPending ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <RefreshIcon style={{ width: '14px', height: '14px' }} />
                  {isPending ? 'กำลังลองส่งใหม่...' : 'ลองส่งใหม่ (Retry)'}
                </button>
              </div>

              <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                <div>ผู้รับ: <strong>{d.buyerName || 'ผู้ซื้อ'}</strong> ({d.recipientEmail})</div>
                {d.error && (
                  <div style={{ marginTop: '0.4rem', color: '#b91c1c' }}>
                    สาเหตุที่ล้มเหลว: <span style={{ fontFamily: 'monospace' }}>{d.error}</span>
                  </div>
                )}
                <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                  ส่งเมื่อ: {new Date(d.createdAt).toLocaleString('th-TH')} | พยายามแล้ว: {d.retryCount} ครั้ง
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
