export default function NewsDetailLoading() {
  return (
    <main className="skeleton-page-wrapper" style={{ maxWidth: '820px' }} aria-busy="true">
      {/* 1. Back Navigation Link */}
      <div className="news-back-nav" style={{ marginBottom: '1.5rem' }}>
        <div className="skeleton-pill skeleton-shimmer" style={{ width: '160px', height: '24px' }} />
      </div>

      {/* 2. Cover Image 16:9 */}
      <div className="news-detail-cover skeleton-shimmer" style={{ width: '100%', height: '320px', borderRadius: '16px', marginBottom: '2rem' }} />

      {/* 3. Article Header */}
      <header className="news-article-header" style={{ marginBottom: '2.5rem' }}>
        <div className="skeleton-pill skeleton-shimmer" style={{ width: '80px', height: '26px', marginBottom: '1rem' }} />
        <div className="skeleton-title skeleton-shimmer" style={{ width: '85%', height: '2.4rem', marginBottom: '1rem' }} />
        <div className="news-article-meta" style={{ display: 'flex', gap: '1.5rem' }}>
          <div className="skeleton-text skeleton-shimmer" style={{ width: '160px', height: '1rem', margin: 0 }} />
          <div className="skeleton-text skeleton-shimmer" style={{ width: '120px', height: '1rem', margin: 0 }} />
        </div>
      </header>

      {/* 4. Actionable Concert Conversion Card Skeleton */}
      <section className="news-related-concert-card" aria-label="กำลังโหลดคอนเสิร์ตที่เกี่ยวข้อง" style={{ padding: '1.25rem', border: '1px solid #e2e8f0', borderRadius: '14px', marginBottom: '2.5rem', display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
        <div className="skeleton-box skeleton-shimmer" style={{ width: '80px', height: '100px', borderRadius: '8px', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton-text skeleton-shimmer" style={{ width: '100px', height: '0.8rem', marginBottom: '0.4rem' }} />
          <div className="skeleton-title skeleton-shimmer" style={{ width: '70%', height: '1.2rem', marginBottom: '0.4rem' }} />
          <div className="skeleton-text skeleton-shimmer" style={{ width: '40%', height: '0.85rem', margin: 0 }} />
        </div>
      </section>

      {/* 5. Article Paragraphs Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div className="skeleton-text skeleton-shimmer" style={{ width: '100%', height: '1.05rem', margin: 0 }} />
            <div className="skeleton-text skeleton-shimmer" style={{ width: '97%', height: '1.05rem', margin: 0 }} />
            <div className="skeleton-text skeleton-shimmer" style={{ width: '92%', height: '1.05rem', margin: 0 }} />
            <div className="skeleton-text skeleton-shimmer" style={{ width: `${60 + (i % 3) * 15}%`, height: '1.05rem', margin: 0 }} />
          </div>
        ))}
      </div>
    </main>
  );
}
