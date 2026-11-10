import { PurchaseStepIndicator } from '@/components/purchase-step-indicator';

export default function PaymentLoading() {
  return (
    <main className="skeleton-page-wrapper" aria-busy="true">
      {/* 1. Step Indicator (Step 3: Payment Active) */}
      <PurchaseStepIndicator currentStep="payment" />

      {/* 2. 15-Minute Countdown Top Bar Skeleton */}
      <div className="skeleton-box skeleton-shimmer" style={{ height: '48px', borderRadius: '10px', marginBottom: '1.5rem' }} />

      {/* 3. Compact Status Bar */}
      <section className="checkout-compact-status-bar" aria-label="กำลังโหลดข้อมูลคำสั่งซื้อ">
        <div className="checkout-status-left">
          <div className="checkout-status-event-info" style={{ width: '100%' }}>
            <div className="skeleton-title skeleton-shimmer" style={{ width: '45%', height: '1.5rem', marginBottom: '0.4rem' }} />
            <div className="checkout-status-meta" style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
              <div className="skeleton-text skeleton-shimmer" style={{ width: '180px', height: '0.9rem', margin: 0 }} />
              <div className="skeleton-text skeleton-shimmer" style={{ width: '160px', height: '0.9rem', margin: 0 }} />
            </div>
          </div>
        </div>
      </section>

      {/* 4. Buyer Contact Details Card (Pure Typography Zero-Box D-266) */}
      <section className="payment-buyer-details-card" aria-label="ข้อมูลผู้สั่งซื้อ">
        <div className="payment-card-header">
          <div className="payment-card-title-wrap">
            <div className="skeleton-title skeleton-shimmer" style={{ width: '160px', height: '1.3rem', margin: 0 }} />
          </div>
        </div>

        <div className="payment-buyer-grid">
          <div className="buyer-grid-item">
            <div className="skeleton-text skeleton-shimmer" style={{ width: '70px', height: '0.85rem', marginBottom: '0.35rem' }} />
            <div className="skeleton-text skeleton-shimmer" style={{ width: '130px', height: '1.05rem', margin: 0 }} />
          </div>
          <div className="buyer-grid-item">
            <div className="skeleton-text skeleton-shimmer" style={{ width: '70px', height: '0.85rem', marginBottom: '0.35rem' }} />
            <div className="skeleton-text skeleton-shimmer" style={{ width: '150px', height: '1.05rem', margin: 0 }} />
          </div>
          <div className="buyer-grid-item">
            <div className="skeleton-text skeleton-shimmer" style={{ width: '90px', height: '0.85rem', marginBottom: '0.35rem' }} />
            <div className="skeleton-text skeleton-shimmer" style={{ width: '110px', height: '1.05rem', margin: 0 }} />
          </div>
        </div>

        <div className="payment-buyer-disclaimer">
          <div className="skeleton-text skeleton-shimmer" style={{ width: '380px', height: '0.85rem', margin: 0 }} />
        </div>
      </section>

      {/* 5. PromptPay QR Payment Section */}
      <section className="payment-qr-card" aria-label="ชำระเงินผ่าน PromptPay QR">
        <div className="payment-qr-card-header" style={{ textAlign: 'center' }}>
          <div className="skeleton-title skeleton-shimmer" style={{ width: '240px', height: '1.4rem', margin: '0 auto 0.5rem' }} />
          <div className="skeleton-text skeleton-shimmer" style={{ width: '360px', height: '0.9rem', margin: '0 auto 1.5rem' }} />
        </div>

        <div className="payment-qr-frame" style={{ width: '240px', height: '240px', margin: '0 auto 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="skeleton-box skeleton-shimmer" style={{ width: '210px', height: '210px', borderRadius: '12px' }} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div className="skeleton-pill skeleton-shimmer" style={{ width: '190px', height: '38px', margin: '0 auto' }} />
        </div>

        <div className="payment-charge-meta" style={{ textAlign: 'center' }}>
          <div className="skeleton-text skeleton-shimmer" style={{ width: '200px', height: '0.85rem', margin: '0 auto' }} />
        </div>
      </section>

      {/* 6. Order Summary Card */}
      <section className="payment-order-summary-card" aria-label="สรุปรายการคำสั่งซื้อ">
        <div className="payment-card-header">
          <div className="skeleton-title skeleton-shimmer" style={{ width: '170px', height: '1.3rem', margin: 0 }} />
          <div className="skeleton-pill skeleton-shimmer" style={{ width: '70px', height: '24px' }} />
        </div>

        <div className="payment-items-list">
          <div className="payment-item-row">
            <div className="skeleton-text skeleton-shimmer" style={{ width: '140px', height: '1rem', margin: 0 }} />
            <div className="skeleton-text skeleton-shimmer" style={{ width: '80px', height: '1rem', margin: 0 }} />
          </div>
          <div className="payment-item-row">
            <div className="skeleton-text skeleton-shimmer" style={{ width: '110px', height: '0.9rem', margin: 0 }} />
            <div className="skeleton-text skeleton-shimmer" style={{ width: '60px', height: '0.9rem', margin: 0 }} />
          </div>
        </div>

        <hr className="detail-section-divider" style={{ margin: '1rem 0' }} />

        <div className="payment-grand-total-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="skeleton-text skeleton-shimmer" style={{ width: '100px', height: '1.2rem', margin: 0 }} />
          <div className="skeleton-title skeleton-shimmer" style={{ width: '130px', height: '1.7rem', margin: 0 }} />
        </div>
      </section>
    </main>
  );
}
