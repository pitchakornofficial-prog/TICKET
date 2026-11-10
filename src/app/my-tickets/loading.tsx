export default function MyTicketsLoading() {
  return (
    <main className="skeleton-page-wrapper" style={{ maxWidth: '880px' }} aria-busy="true">
      {/* 1. Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div className="skeleton-title skeleton-shimmer" style={{ width: '220px', height: '1.9rem', marginBottom: '0.5rem' }} />
        <div className="skeleton-text skeleton-shimmer" style={{ width: '420px', height: '1rem', margin: 0 }} />
      </div>

      {/* 2. Lookup Card */}
      <div className="lookup-search-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '2rem', marginBottom: '2.5rem', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)' }}>
        <div className="skeleton-text skeleton-shimmer" style={{ width: '180px', height: '1rem', marginBottom: '1rem' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '1rem', alignItems: 'center' }}>
          <div className="skeleton-box skeleton-shimmer" style={{ height: '46px', borderRadius: '10px' }} />
          <div className="skeleton-pill skeleton-shimmer" style={{ height: '46px' }} />
        </div>
        <div className="skeleton-text skeleton-shimmer" style={{ width: '300px', height: '0.8rem', marginTop: '1rem', marginBottom: 0 }} />
      </div>

      {/* 3. Ticket Cards List Skeleton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {[1, 2].map(i => (
          <div key={i} className="skeleton-box" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 130px', gap: '1.5rem', alignItems: 'center' }}>
            <div>
              <div className="skeleton-pill skeleton-shimmer" style={{ width: '90px', height: '22px', marginBottom: '0.65rem' }} />
              <div className="skeleton-title skeleton-shimmer" style={{ width: '65%', height: '1.3rem', marginBottom: '0.5rem' }} />
              <div className="skeleton-text skeleton-shimmer" style={{ width: '45%', height: '0.9rem', margin: 0 }} />
            </div>
            <div className="skeleton-box skeleton-shimmer" style={{ width: '120px', height: '120px', borderRadius: '10px' }} />
          </div>
        ))}
      </div>
    </main>
  );
}
