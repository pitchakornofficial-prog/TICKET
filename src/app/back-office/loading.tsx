export default function BackOfficeLoading() {
  return (
    <main className="skeleton-page-wrapper" style={{ maxWidth: '1400px' }} aria-busy="true">
      {/* 1. Header Toolbar Skeleton */}
      <header className="admin-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem', background: '#ffffff', padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <div className="admin-topbar-left" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="skeleton-box skeleton-shimmer" style={{ width: '130px', height: '36px', borderRadius: '8px' }} />
          <div className="skeleton-text skeleton-shimmer" style={{ width: '140px', height: '16px', margin: 0 }} />
        </div>
        <div className="admin-topbar-right" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="skeleton-pill skeleton-shimmer" style={{ width: '110px', height: '32px' }} />
          <div className="skeleton-circle skeleton-shimmer" style={{ width: '36px', height: '36px' }} />
          <div className="skeleton-pill skeleton-shimmer" style={{ width: '80px', height: '32px' }} />
        </div>
      </header>

      {/* 2. Four KPI Cards Skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton-box" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)' }}>
            <div className="skeleton-text skeleton-shimmer" style={{ width: '50%', height: '0.85rem', marginBottom: '0.75rem' }} />
            <div className="skeleton-title skeleton-shimmer" style={{ width: '70%', height: '2rem', margin: 0 }} />
          </div>
        ))}
      </div>

      {/* 3. Table / Management Panel Skeleton */}
      <div className="skeleton-box" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.75rem', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div className="skeleton-title skeleton-shimmer" style={{ width: '220px', height: '1.4rem', margin: 0 }} />
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className="skeleton-box skeleton-shimmer" style={{ width: '180px', height: '38px', borderRadius: '8px' }} />
            <div className="skeleton-pill skeleton-shimmer" style={{ width: '110px', height: '38px' }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 0', borderBottom: '1px solid #f1f5f9' }}>
              <div className="skeleton-text skeleton-shimmer" style={{ width: '30%', height: '16px', margin: 0 }} />
              <div className="skeleton-text skeleton-shimmer" style={{ width: '20%', height: '16px', margin: 0 }} />
              <div className="skeleton-text skeleton-shimmer" style={{ width: '15%', height: '16px', margin: 0 }} />
              <div className="skeleton-pill skeleton-shimmer" style={{ width: '85px', height: '28px' }} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
