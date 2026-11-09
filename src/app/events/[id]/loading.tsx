import { PurchaseStepIndicator } from '@/components/purchase-step-indicator';

export default function EventDetailLoading() {
  return (
    <main className="event-detail-page skeleton-page-wrapper" aria-busy="true">
      {/* 1. Top back navigation placeholder */}
      <nav className="detail-breadcrumb" aria-label="กำลังโหลดรายละเอียดคอนเสิร์ต">
        <div className="skeleton-pill skeleton-shimmer" style={{ width: '150px', height: '24px' }} />
      </nav>

      {/* 2. Step Indicator (Step 1: Details Active) */}
      <PurchaseStepIndicator currentStep="details" />

      {/* 3. Wide Panoramic Cover Banner (D-34) */}
      <div className="event-cover-banner-wrapper skeleton-shimmer skeleton-detail-cover" style={{ minHeight: '260px' }} />

      {/* 4. Hero Event Overview Card (D-34, D-35) */}
      <header className="event-hero-card skeleton-detail-hero-card">
        <div className="hero-card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div className="skeleton-title skeleton-shimmer" style={{ width: '55%', height: '2.2rem', margin: 0 }} />
          <div className="hero-price-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
            <div className="skeleton-text skeleton-shimmer" style={{ width: '60px', height: '0.8rem', margin: 0 }} />
            <div className="skeleton-pill skeleton-shimmer" style={{ width: '140px', height: '28px' }} />
          </div>
        </div>

        {/* Horizontal Meta Cards Track (D-148) */}
        <div className="hero-meta-cards-track">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="hero-meta-card">
              <div className="meta-icon-box skeleton-shimmer" style={{ width: '36px', height: '36px', borderRadius: '8px' }} />
              <div className="hero-meta-card-content" style={{ width: '100%' }}>
                <div className="skeleton-text skeleton-shimmer" style={{ width: '45%', height: '0.8rem', marginBottom: '0.35rem' }} />
                <div className="skeleton-text skeleton-shimmer" style={{ width: '80%', height: '1rem', margin: 0 }} />
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* 5. Categorized Detail Cards */}
      <div className="event-categories-list">
        {/* Category: Lineup & Details */}
        <section className="event-category-card" aria-label="รายละเอียดคอนเสิร์ตและไลน์อัปศิลปิน">
          <div className="category-header-wrap" style={{ marginBottom: '1.25rem' }}>
            <div className="skeleton-title skeleton-shimmer" style={{ width: '280px', height: '1.5rem', margin: 0 }} />
          </div>

          <div className="category-body-content">
            <div className="detail-with-poster-layout">
              {/* Sharp 4:5 Vertical Poster */}
              <div className="detail-poster-card-col">
                <div className="skeleton-box skeleton-shimmer" style={{ width: '100%', aspectRatio: '4 / 5', borderRadius: '12px' }} />
              </div>

              {/* 2x2 Lineup Grid & Description */}
              <div className="detail-info-col">
                <div className="artist-lineup-section">
                  <div className="skeleton-text skeleton-shimmer" style={{ width: '220px', height: '1.1rem', marginBottom: '1rem' }} />
                  <div className="artist-grid-2x2">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="artist-card-item">
                        <div className="skeleton-pill skeleton-shimmer" style={{ width: '60px', height: '18px', marginBottom: '0.4rem' }} />
                        <div className="skeleton-text skeleton-shimmer" style={{ width: '80%', height: '1rem', margin: 0 }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="event-description-section" style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--line)' }}>
                  <div className="skeleton-text skeleton-shimmer" style={{ width: '160px', height: '1.1rem', marginBottom: '0.8rem' }} />
                  <div className="skeleton-text skeleton-shimmer" style={{ width: '100%', height: '0.95rem' }} />
                  <div className="skeleton-text skeleton-shimmer" style={{ width: '96%', height: '0.95rem' }} />
                  <div className="skeleton-text skeleton-shimmer" style={{ width: '85%', height: '0.95rem' }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section Divider (D-264) */}
        <hr className="detail-section-divider" />

        {/* Category: Event Sessions Accordion */}
        <section className="event-category-card" aria-label="รอบการแสดงและประเภทบัตร">
          <div className="category-header-wrap" style={{ marginBottom: '1.25rem' }}>
            <div className="skeleton-title skeleton-shimmer" style={{ width: '240px', height: '1.5rem', margin: 0 }} />
          </div>

          <div className="category-body-content">
            <div className="session-accordion-card" style={{ padding: '1.25rem', border: '1.5px solid var(--line)', borderRadius: '14px', background: 'var(--white)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="skeleton-pill skeleton-shimmer" style={{ width: '70px', height: '26px' }} />
                  <div className="skeleton-text skeleton-shimmer" style={{ width: '220px', height: '1.1rem', margin: 0 }} />
                </div>
                <div className="skeleton-pill skeleton-shimmer" style={{ width: '90px', height: '36px' }} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
