'use client';

import { ShieldCheckIcon } from './icons';
import { AlertIcon } from './alert-icon';

export interface QuotaLimitAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEditBuyer: () => void;
  buyerEmail?: string;
  alreadyPurchased: number;
  limitPerOrder: number;
  remainingQuota: number;
  requestedQuantity?: number;
}

export function QuotaLimitAlertModal({
  isOpen,
  onClose,
  onEditBuyer,
  buyerEmail,
  alreadyPurchased,
  limitPerOrder,
  remainingQuota,
  requestedQuantity,
}: QuotaLimitAlertModalProps) {
  if (!isOpen) return null;

  const isFullyExhausted = remainingQuota <= 0;

  return (
    <div
      className="quota-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quota-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      <div
        className="quota-modal-card"
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid rgba(226, 232, 240, 0.9)',
          overflow: 'hidden',
          padding: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: isFullyExhausted ? '#fef2f2' : '#fffbeb',
              border: `1px solid ${isFullyExhausted ? '#fecaca' : '#fde68a'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {isFullyExhausted ? (
              <AlertIcon />
            ) : (
              <ShieldCheckIcon style={{ width: '26px', height: '26px', color: '#d97706' }} />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <h3
              id="quota-modal-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#0f172a',
                margin: '0 0 0.25rem',
                lineHeight: 1.3,
              }}
            >
              {isFullyExhausted ? 'ใช้สิทธิ์ซื้อบัตรครบเพดานแล้ว' : 'เกินโควตาสิทธิ์การซื้อสะสม'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
              นโยบายป้องกันการกักตุนบัตร (Anti-Scalping Cumulative Limit)
            </p>
          </div>
        </div>

        {/* Breakdown box */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.25rem',
            fontSize: '0.9rem',
          }}
        >
          {buyerEmail && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingBottom: '0.6rem',
                marginBottom: '0.6rem',
                borderBottom: '1px dashed #cbd5e1',
              }}
            >
              <span style={{ color: '#64748b' }}>อีเมลผู้ซื้อ:</span>
              <strong style={{ color: '#0f172a', wordBreak: 'break-all' }}>{buyerEmail}</strong>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '0.4rem',
            }}
          >
            <span style={{ color: '#64748b' }}>เคยสั่งซื้อ/ถือครองแล้ว:</span>
            <strong style={{ color: isFullyExhausted ? '#dc2626' : '#d97706' }}>
              {alreadyPurchased} / {limitPerOrder} ใบ
            </strong>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: requestedQuantity ? '0.4rem' : '0',
            }}
          >
            <span style={{ color: '#64748b' }}>สิทธิ์คงเหลือที่ซื้อเพิ่มได้:</span>
            <strong style={{ color: remainingQuota > 0 ? '#16a34a' : '#dc2626' }}>
              {remainingQuota} ใบ
            </strong>
          </div>

          {requestedQuantity && requestedQuantity > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '0.4rem',
                borderTop: '1px dashed #e2e8f0',
              }}
            >
              <span style={{ color: '#64748b' }}>จำนวนที่ท่านกำลังเลือก:</span>
              <strong style={{ color: '#0f172a' }}>{requestedQuantity} ใบ</strong>
            </div>
          )}
        </div>

        {/* Explanation text */}
        <p
          style={{
            margin: '0 0 1.5rem',
            fontSize: '0.92rem',
            color: '#334155',
            lineHeight: 1.6,
          }}
        >
          {isFullyExhausted
            ? `ท่านได้สั่งซื้อหรือมีรายการจองบัตรคอนเสิร์ตนี้ครบตามจำนวนจำกัดแล้ว (${alreadyPurchased} / ${limitPerOrder} ใบ) เพื่อกระจายโอกาสในการเข้าชมให้แก่ผู้ชมท่านอื่น หากต้องการซื้อเพิ่ม กรุณาใช้อีเมลของสมาชิกหรือผู้ร่วมงานท่านอื่นในการสั่งซื้อ`
            : `ท่านเคยสั่งซื้อบัตรคอนเสิร์ตนี้ไปแล้ว ${alreadyPurchased} ใบ จึงสามารถเลือกซื้อเพิ่มได้อีกสูงสุดไม่เกิน ${remainingQuota} ใบ สำหรับอีเมลนี้`}
        </p>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            type="button"
            id="quota-modal-edit-buyer-btn"
            onClick={onEditBuyer}
            style={{
              width: '100%',
              padding: '0.8rem 1.25rem',
              background: 'var(--blue, #2563eb)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            แก้ไขข้อมูลผู้ซื้อ / ใช้อีเมลอื่น
          </button>
          <button
            type="button"
            id="quota-modal-close-btn"
            onClick={onClose}
            style={{
              width: '100%',
              padding: '0.75rem 1.25rem',
              background: 'transparent',
              color: '#64748b',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              fontWeight: 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
