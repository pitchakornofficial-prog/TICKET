export default function NewsLoading() {
  return (
    <main className="skeleton-page-wrapper" aria-busy="true">
      {/* 1. News Page Header */}
      <header className="static-header" style={{ marginBottom: '2.5rem' }}>
        <div className="skeleton-text skeleton-shimmer" style={{ width: '180px', height: '0.85rem', marginBottom: '0.5rem' }} />
        <div className="skeleton-title skeleton-shimmer" style={{ width: '280px', height: '2.2rem', marginBottom: '0.75rem' }} />
        <div className="skeleton-text skeleton-shimmer" style={{ width: '480px', height: '1rem', margin: 0 }} />
      </header>

      {/* 2. Featured Highlight Card Skeleton */}
      <div className="skeleton-box" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', marginBottom: '2.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        <div className="skeleton-shimmer" style={{ width: '100%', height: '260px' }} />
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="skeleton-pill skeleton-shimmer" style={{ width: '80px', height: '24px', marginBottom: '0.75rem' }} />
          <div className="skeleton-title skeleton-shimmer" style={{ width: '85%', height: '1.5rem', marginBottom: '0.65rem' }} />
          <div className="skeleton-text skeleton-shimmer" style={{ width: '95%', height: '0.95rem' }} />
          <div className="skeleton-text skeleton-shimmer" style={{ width: '70%', height: '0.95rem', marginBottom: '1rem' }} />
          <div className="skeleton-text skeleton-shimmer" style={{ width: '120px', height: '0.85rem', margin: 0 }} />
        </div>
      </div>

      {/* 3. News Magazine Grid Skeleton */}
      <div className="skeleton-magazine-grid">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <article key={i} className="skeleton-magazine-card">
            <div className="skeleton-shimmer" style={{ width: '100%', height: '180px' }} />
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div className="skeleton-pill skeleton-shimmer" style={{ width: '70px', height: '20px' }} />
              <div className="skeleton-title skeleton-shimmer" style={{ width: '90%', height: '1.2rem', margin: 0 }} />
              <div className="skeleton-text skeleton-shimmer" style={{ width: '100%', height: '0.85rem' }} />
              <div className="skeleton-text skeleton-shimmer" style={{ width: '60%', height: '0.85rem', margin: 0 }} />
              <div className="skeleton-text skeleton-shimmer" style={{ width: '100px', height: '0.75rem', marginTop: '0.5rem', margin: 0 }} />
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
