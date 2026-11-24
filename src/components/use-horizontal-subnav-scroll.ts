'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export function useHorizontalSubnavScroll() {
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    // Buffer of 4px to account for fractional pixel rounding
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4);
  }, []);

  // Update on scroll & resize
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;

    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateScrollState();
      });
      resizeObserver.observe(el);
    }

    const handleWindowResize = () => updateScrollState();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [updateScrollState]);

  // Mouse wheel horizontal scroll conversion and drag-to-scroll
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // If there's horizontal overflow, convert vertical wheel to horizontal scroll
      if (el.scrollWidth > el.clientWidth) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && Math.abs(e.deltaY) > 0) {
          const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
          el.scrollLeft += delta * 1.2;
          e.preventDefault();
        }
      }
    };

    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let hasMoved = false;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (el.scrollWidth <= el.clientWidth) return;
      isDown = true;
      hasMoved = false;
      startX = e.pageX - el.offsetLeft;
      startScrollLeft = el.scrollLeft;
      el.classList.add('is-dragging');
      el.style.scrollBehavior = 'auto';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = x - startX;
      if (Math.abs(walk) > 4) {
        hasMoved = true;
      }
      el.scrollLeft = startScrollLeft - walk;
    };

    const onMouseUp = () => {
      if (isDown) {
        isDown = false;
        el.classList.remove('is-dragging');
        el.style.scrollBehavior = '';
      }
    };

    const onClickCapture = (e: MouseEvent) => {
      if (hasMoved) {
        e.stopPropagation();
        e.preventDefault();
        hasMoved = false;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('click', onClickCapture, true);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  // Programmatic scroll helpers
  const scrollLeft = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    el.scrollBy({ left: -260, behavior: 'smooth' });
  }, []);

  const scrollRight = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    el.scrollBy({ left: 260, behavior: 'smooth' });
  }, []);

  // Center active element inside scroll view
  const scrollActiveIntoView = useCallback((selector: string) => {
    const el = tabsRef.current;
    if (!el) return;
    const activeTab = el.querySelector<HTMLElement>(selector);
    if (!activeTab) return;

    const containerWidth = el.clientWidth;
    const tabOffsetLeft = activeTab.offsetLeft;
    const tabWidth = activeTab.offsetWidth;
    const targetScrollLeft = tabOffsetLeft - containerWidth / 2 + tabWidth / 2;

    el.scrollTo({
      left: Math.max(0, targetScrollLeft),
      behavior: 'smooth',
    });
  }, []);

  return {
    tabsRef,
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    scrollActiveIntoView,
  };
}
