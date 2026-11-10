export default function RootRouteLoading() {
  return (
    <main className="skeleton-page-wrapper" aria-busy="true">
      {/* 1. Subtle Top Route Progress Indicator */}
      <div
        className="skeleton-shimmer"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          zIndex: 9999,
          background: 'linear-gradient(90deg, #1848ed, #60a5fa, #1848ed)',
        }}
      />

      {/* 2. Neutral Minimal Route Loading Shell (Root Loading Bleed Prevention D-270) */}
      <div style={{ maxWidth: '1100px', margin: '2.5rem auto 0', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="skeleton-title skeleton-shimmer" style={{ width: '240px', height: '1.8rem', margin: 0 }} />
        <div className="skeleton-text skeleton-shimmer" style={{ width: '380px', height: '1rem', margin: 0 }} />
        <div
          className="skeleton-box skeleton-shimmer"
          style={{ width: '100%', height: '320px', borderRadius: '16px' }}
        />
      </div>
    </main>
  );
}
