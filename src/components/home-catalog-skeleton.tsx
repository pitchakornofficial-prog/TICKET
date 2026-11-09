export function HomeCatalogSkeleton() {
  return (
    <main className="skeleton-page-wrapper" aria-busy="true">
      {/* 1. Hero Panoramic Banner Skeleton */}
      <div className="skeleton-home-banner skeleton-shimmer" />
      <div className="skeleton-dots-bar" aria-hidden="true">
        <span className="skeleton-dot skeleton-shimmer active" />
        <span className="skeleton-dot skeleton-shimmer" />
        <span className="skeleton-dot skeleton-shimmer" />
      </div>

      {/* 2. Section Divider between Banner & Catalog */}
      <hr className="catalog-section-divider" />

      {/* 3. General Concert Catalog Section */}
      <section className="catalog-section" aria-label="กำลังโหลดรายการคอนเสิร์ต">
        <div className="catalog-header-bar">
          <div className="section-title-wrap" style={{ marginBottom: 0 }}>
            <div className="skeleton-title skeleton-shimmer" style={{ width: '180px', height: '1.75rem', marginBottom: '0.4rem' }} />
            <div className="skeleton-text skeleton-shimmer" style={{ width: '320px', height: '0.9rem', margin: 0 }} />
          </div>

          {/* Filter Tabs Skeleton */}
          <div className="catalog-tabs" aria-hidden="true">
            <div className="skeleton-pill skeleton-shimmer" style={{ width: '100px', height: '38px' }} />
            <div className="skeleton-pill skeleton-shimmer" style={{ width: '120px', height: '38px' }} />
            <div className="skeleton-pill skeleton-shimmer" style={{ width: '90px', height: '38px' }} />
          </div>
        </div>

        {/* 4. Concert Cards Grid Skeleton (4 columns desktop, 2 columns mobile) */}
        <div className="catalog-grid-wrapper">
          <div className="catalog-events-grid skeleton-catalog-grid">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <article key={i} className="concert-card-split catalog-card-item skeleton-concert-card">
                <div className="card-split-poster-frame skeleton-concert-poster skeleton-shimmer" />
                <div className="card-split-info-box skeleton-concert-body">
                  <div className="skeleton-text skeleton-shimmer" style={{ width: '80%', height: '1.15rem', marginBottom: '0.5rem' }} />
                  <div className="skeleton-text skeleton-shimmer" style={{ width: '55%', height: '0.85rem', marginBottom: '0.75rem' }} />
                  <div className="card-split-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                    <div className="skeleton-text skeleton-shimmer" style={{ width: '45%', height: '1rem', margin: 0 }} />
                    <div className="skeleton-pill skeleton-shimmer" style={{ width: '70px', height: '32px' }} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
