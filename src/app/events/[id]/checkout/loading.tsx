import { PurchaseStepIndicator } from '@/components/purchase-step-indicator';

export default function CheckoutLoading() {
  return (
    <main className="skeleton-page-wrapper" aria-busy="true">
      {/* 1. Back link */}
      <div className="detail-breadcrumb" style={{ marginBottom: '1.25rem' }}>
        <div className="skeleton-pill skeleton-shimmer" style={{ width: '160px', height: '24px' }} />
      </div>

      {/* 2. Step Indicator (Step 2: Checkout Active) */}
      <PurchaseStepIndicator currentStep="checkout" />

      {/* 3. Compact Status Bar (D-265) */}
      <section className="checkout-compact-status-bar" aria-label="กำลังโหลดข้อมูลรอบการแสดง">
        <div className="checkout-status-left">
          <div className="checkout-status-event-info" style={{ width: '100%' }}>
            <div className="skeleton-title skeleton-shimmer" style={{ width: '50%', height: '1.5rem', marginBottom: '0.4rem' }} />
            <div className="checkout-status-meta" style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
              <div className="skeleton-text skeleton-shimmer" style={{ width: '160px', height: '0.9rem', margin: 0 }} />
              <div className="skeleton-text skeleton-shimmer" style={{ width: '200px', height: '0.9rem', margin: 0 }} />
            </div>
          </div>
        </div>
        <div className="skeleton-pill skeleton-shimmer" style={{ width: '100px', height: '34px' }} />
      </section>

      {/* 4. Session Selection Card (D-265) */}
      <div className="card" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
        <div className="skeleton-title skeleton-shimmer" style={{ width: '160px', height: '1.3rem', marginBottom: '1.25rem' }} />
        <div className="session-tab-chips-grid session-tab-chips-grid-2cols">
          {[1, 2].map(i => (
            <div key={i} className={`session-tab-chip-card ${i === 1 ? 'session-tab-chip-active' : ''}`} style={{ cursor: 'default' }}>
              <div className="session-tab-chip-top">
                <span className="session-tab-chip-pill">รอบ {i}</span>
                {i === 1 && <span className="session-tab-chip-selected">เลือกแล้ว</span>}
              </div>
              <div className="skeleton-text skeleton-shimmer" style={{ width: '65%', height: '1.1rem', margin: '0.5rem 0 0.25rem' }} />
              <div className="skeleton-text skeleton-shimmer" style={{ width: '85%', height: '0.9rem', margin: 0 }} />
            </div>
          ))}
        </div>
      </div>

      {/* 5. Ticket Selection Rows Card */}
      <div className="card" style={{ padding: '1.75rem', marginBottom: '2.5rem' }}>
        <div className="skeleton-title skeleton-shimmer" style={{ width: '240px', height: '1.3rem', marginBottom: '1.25rem' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {[1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                padding: '1.15rem 1.25rem',
                background: 'var(--white)',
                border: '1.5px solid var(--line)',
                borderRadius: '12px',
              }}
            >
              <div style={{ flex: '1 1 220px' }}>
                <div className="skeleton-text skeleton-shimmer" style={{ width: '130px', height: '1.15rem', marginBottom: '0.35rem' }} />
                <div className="skeleton-text skeleton-shimmer" style={{ width: '180px', height: '0.85rem', marginBottom: '0.35rem' }} />
                <div className="skeleton-text skeleton-shimmer" style={{ width: '100px', height: '0.85rem', margin: 0 }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                <div className="skeleton-title skeleton-shimmer" style={{ width: '90px', height: '1.3rem', margin: 0 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="skeleton-box skeleton-shimmer" style={{ width: '38px', height: '38px', borderRadius: '10px' }} />
                  <div className="skeleton-text skeleton-shimmer" style={{ width: '24px', height: '1.1rem', margin: 0 }} />
                  <div className="skeleton-box skeleton-shimmer" style={{ width: '38px', height: '38px', borderRadius: '10px' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
