'use client';

import { useState, useEffect, useCallback } from 'react';

export interface FloatingBackToTopProps {
  hasStickyBar?: boolean;
  threshold?: number;
  className?: string;
  testId?: string;
}

const DEFAULT_HEADER_GAP_PX = 12;

/**
 * Compute the floating button top offset (in px) directly below the lowest
 * active sticky chrome element (e.g. .site-header or a sticky subnav).
 */
export function computeBackToTopOffset(
  bottomPositions: ReadonlyArray<number | null | undefined>,
  gapPx = DEFAULT_HEADER_GAP_PX,
): number | null {
  let maxBottom = 0;
  for (const bottom of bottomPositions) {
    if (typeof bottom === 'number' && Number.isFinite(bottom) && bottom > maxBottom) {
      maxBottom = bottom;
    }
  }
  return maxBottom > 0 ? Math.ceil(maxBottom + gapPx) : null;
}

function measureStickyChromeBottom(): number | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return null;
  }

  const bottoms: number[] = [];
  const header = document.querySelector<HTMLElement>('.site-header');
  if (header) {
    const rect = header.getBoundingClientRect();
    if (rect.height > 0 && rect.bottom > 0) {
      bottoms.push(rect.bottom);
    }
  }

  const subnavs = document.querySelectorAll<HTMLElement>('.workspace-subnav, [data-sticky-subnav]');
  for (const subnav of subnavs) {
    const style = window.getComputedStyle(subnav);
    if (style.position === 'sticky' || style.position === 'fixed') {
      const rect = subnav.getBoundingClientRect();
      if (rect.height > 0 && rect.top >= -1 && rect.bottom > 0 && rect.top <= window.innerHeight * 0.4) {
        bottoms.push(rect.bottom);
      }
    }
  }

  return computeBackToTopOffset(bottoms);
}

/**
 * Universal Floating Back-to-Top button (D-172)
 * Unified with the established benchmark design across the platform (D-78, D-87).
 * Smoothly scrolls the window back to the top when clicked.
 * Positions itself cleanly below the sticky navbar (and any sticky subnav).
 */
export function FloatingBackToTop({
  hasStickyBar = false,
  threshold = 300,
  className = '',
  testId = 'floating-back-to-top-btn',
}: FloatingBackToTopProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [topOffsetPx, setTopOffsetPx] = useState<number | null>(null);

  useEffect(() => {
    const updatePositionAndVisibility = () => {
      const visible = window.scrollY > threshold;
      setIsVisible(visible);
      if (visible) {
        setTopOffsetPx(measureStickyChromeBottom());
      }
    };

    updatePositionAndVisibility();

    window.addEventListener('scroll', updatePositionAndVisibility, { passive: true });
    window.addEventListener('resize', updatePositionAndVisibility, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      const header = document.querySelector<HTMLElement>('.site-header');
      if (header) {
        resizeObserver = new ResizeObserver(() => {
          if (window.scrollY > threshold) {
            setTopOffsetPx(measureStickyChromeBottom());
          }
        });
        resizeObserver.observe(header);
      }
    }

    return () => {
      window.removeEventListener('scroll', updatePositionAndVisibility);
      window.removeEventListener('resize', updatePositionAndVisibility);
      resizeObserver?.disconnect();
    };
  }, [threshold]);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      style={topOffsetPx !== null ? { top: `${topOffsetPx}px` } : undefined}
      className={`floating-back-to-top${hasStickyBar ? ' has-sticky-bar' : ''}${className ? ` ${className}` : ''}`}
      title="กลับสู่ด้านบนสุด"
      aria-label="กลับสู่ด้านบนสุด"
      data-testid={testId}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="floating-back-to-top-icon"
      >
        <line x1="12" y1="19" x2="12" y2="5" />
        <polyline points="5 12 12 5 19 12" />
      </svg>
      <span className="floating-back-to-top-label">กลับสู่ด้านบน</span>
    </button>
  );
}
