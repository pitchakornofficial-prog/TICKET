'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatBaht } from '@/lib/locale';
import type { PaymentRecoveryCaseDetail } from '@/server/payment';
import { AlertIcon } from './alert-icon';
import { CheckCircleIcon, ClockIcon } from './icons';

export function OwnerPaymentRecoveryManager() {
  const [cases, setCases] = useState<PaymentRecoveryCaseDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCases = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/owner/payment-exceptions');
      if (!res.ok) {
        throw new Error('โหลดรายการตรวจสอบการชำระเงินไม่สำเร็จ');
      }
      const data = await res.json();
      setCases(data.cases || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

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
      aria-labelledby="payment-recovery-title"
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
            <h2 id="payment-recovery-title" style={{ margin: 0, fontSize: '1.25rem' }}>
              รายการชำระเงินที่ต้องตรวจสอบ / รอคืนเงิน (G-23, G-35)
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)' }}>
            รายการที่ได้รับเงินแต่ไม่ออกบัตรเนื่องจากชำระเงินหลังพ้นกำหนด 15 นาที หรือโควตาไม่พอ ต้องคืนเงินเต็มยอดรวมค่าบริการ
          </p>
        </div>
        <button
          type="button"
          onClick={loadCases}
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

      {cases.length === 0 && !isLoading ? (
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
          ไม่มีรายการชำระเงินที่ต้องตรวจสอบคืนเงินในขณะนี้
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {cases.map((c, idx) => (
            <div
              key={c.id}
              className="payment-exception-card"
              style={{
                border: '1px solid #fed7aa',
                background: '#fffaf5',
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
                  borderBottom: '1px solid #ffedd5',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <span
                      style={{
                        background: c.reason === 'paid_after_deadline' || c.reason === 'paid_after_cancellation' ? '#fee2e2' : '#fef3c7',
                        color: c.reason === 'paid_after_deadline' || c.reason === 'paid_after_cancellation' ? '#991b1b' : '#92400e',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      {c.reason === 'paid_after_deadline'
                        ? 'ชำระเงินหลังหมดเวลา 15 นาที'
                        : c.reason === 'paid_after_cancellation'
                          ? 'ชำระเงินหลังรอบการแสดงถูกยกเลิก (G-52)'
                          : 'โควตาบัตรไม่เพียงพอ'}
                    </span>
                    <strong id={`case-id-${idx}`} style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                      {c.id}
                    </strong>
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
                    คำสั่งซื้อ: <strong id={`case-order-${idx}`}>{c.orderId}</strong> | รหัสธุรกรรม: {c.chargeId}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>ยอดเงินที่ต้องคืน (เต็มจำนวน):</div>
                  <strong id={`case-amount-${idx}`} style={{ fontSize: '1.25rem', color: '#b91c1c' }}>
                    {formatBaht(c.amount)}
                  </strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    (ราคาบัตร {formatBaht(c.subtotal)} + ค่าบริการ {formatBaht(c.customerFee)})
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '0.8rem',
                  fontSize: '0.85rem',
                  color: '#475569',
                }}
              >
                <div>
                  <div>
                    ผู้ซื้อ: <strong id={`case-buyer-name-${idx}`}>{c.buyerName}</strong>
                  </div>
                  <div>
                    อีเมล: <span id={`case-buyer-email-${idx}`}>{c.buyerEmail}</span> | โทร: {c.buyerPhone}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <ClockIcon style={{ width: '16px', height: '16px' }} />
                    <span>เวลาชำระจริง: {new Date(c.providerPaidAt).toLocaleString('th-TH')}</span>
                  </div>
                  <div>กำหนดเวลาเดิม: {new Date(c.orderExpiresAt).toLocaleString('th-TH')}</div>
                </div>
              </div>

              {c.notes && (
                <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                  หมายเหตุ: {c.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
