'use client';

import { useState, useEffect, useCallback } from 'react';

export interface FloatingBackToTopProps {
  hasStickyBar?: boolean;
  threshold?: number;
  className?: string;
  testId?: string;
}

/**
 * Universal Floating Back-to-Top button (D-172)
 * Unified with the established benchmark design across the platform (D-78, D-87).
 * Smoothly scrolls the window back to the top when clicked.
 * Automatically offsets position above bottom sticky bars when hasStickyBar is true.
 */
export function FloatingBackToTop({
  hasStickyBar = false,
  threshold = 300,
  className = '',
  testId = 'floating-back-to-top-btn',
}: FloatingBackToTopProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > threshold);
    };

    // Check initial scroll offset
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
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
    </button>
  );
}
