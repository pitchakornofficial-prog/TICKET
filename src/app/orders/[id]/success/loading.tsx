export default function SuccessLoading() {
  return (
    <main className="skeleton-page-wrapper" aria-busy="true">
      {/* 1. Compact Status Bar */}
      <section className="checkout-compact-status-bar" aria-label="กำลังโหลดข้อมูลคำสั่งซื้อ">
        <div className="checkout-status-left">
          <div className="checkout-status-event-info" style={{ width: '100%' }}>
            <div className="skeleton-title skeleton-shimmer" style={{ width: '50%', height: '1.5rem', marginBottom: '0.4rem' }} />
            <div className="checkout-status-meta" style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
              <div className="skeleton-text skeleton-shimmer" style={{ width: '180px', height: '0.9rem', margin: 0 }} />
              <div className="skeleton-text skeleton-shimmer" style={{ width: '160px', height: '0.9rem', margin: 0 }} />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Tabs Switcher */}
      <nav className="success-tabs-nav" aria-label="ตัวเลือกมุมมอง">
        <div className="success-tabs-pill-wrap" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: '2rem' }}>
          <div className="skeleton-pill skeleton-shimmer" style={{ width: '150px', height: '42px' }} />
          <div className="skeleton-pill skeleton-shimmer" style={{ width: '150px', height: '42px' }} />
        </div>
      </nav>

      {/* 3. Modern Digital Receipt Slip */}
      <div className="receipt-slip-container">
        <div className="payment-receipt-slip-card">
          {/* Slip Header */}
          <div className="slip-header">
            <div className="skeleton-circle skeleton-shimmer" style={{ width: '56px', height: '56px', margin: '0 auto 1rem' }} />
            <div className="skeleton-title skeleton-shimmer" style={{ width: '220px', height: '1.6rem', margin: '0 auto 0.4rem' }} />
            <div className="skeleton-text skeleton-shimmer" style={{ width: '160px', height: '0.95rem', margin: '0 auto' }} />
          </div>

          {/* Amount Box */}
          <div className="slip-amount-box">
            <div className="skeleton-text skeleton-shimmer" style={{ width: '100px', height: '0.85rem', margin: '0 auto 0.5rem' }} />
            <div className="skeleton-title skeleton-shimmer" style={{ width: '160px', height: '2rem', margin: '0 auto 0.5rem' }} />
            <div className="skeleton-pill skeleton-shimmer" style={{ width: '190px', height: '26px', margin: '0 auto' }} />
          </div>

          {/* Perforated Divider */}
          <div className="slip-perforated-divider" aria-hidden="true">
            <div className="slip-notch-left" />
            <div className="slip-dash-line" />
            <div className="slip-notch-right" />
          </div>

          {/* Slip Details Table */}
          <div className="slip-details-grid">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="slip-row">
                <div className="skeleton-text skeleton-shimmer" style={{ width: '35%', height: '0.9rem', margin: 0 }} />
                <div className="skeleton-text skeleton-shimmer" style={{ width: '45%', height: '0.9rem', margin: 0 }} />
              </div>
            ))}
          </div>

          {/* Slip Bottom CTA */}
          <div className="slip-action-footer">
            <div className="skeleton-pill skeleton-shimmer" style={{ width: '220px', height: '46px', margin: '0 auto' }} />
          </div>
        </div>
      </div>
    </main>
  );
}
