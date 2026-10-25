'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SearchIcon } from './icons';

export function NavbarSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [searchTerm, setSearchTerm] = useState(initialQuery);
  const [, startTransition] = useTransition();

  // Sync state if URL changes externally (e.g. back button or clear search)
  useEffect(() => {
    const q = searchParams.get('q') || '';
    setSearchTerm(q);
  }, [searchParams]);

  // Broadcast search query to page listener and sync with URL
  const handleInputChange = (value: string) => {
    setSearchTerm(value);

    // 1. Immediately notify page components via custom event for 0ms instant UI update
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ticket:search', { detail: value }));
    }

    // 2. Sync with URL query parameter
    startTransition(() => {
      if (pathname !== '/') {
        if (value.trim()) {
          router.push(`/?q=${encodeURIComponent(value)}`);
        }
      } else {
        const params = new URLSearchParams(window.location.search);
        if (value.trim()) {
          params.set('q', value);
        } else {
          params.delete('q');
        }
        const newUrl = params.toString() ? `/?${params.toString()}` : '/';
        router.replace(newUrl, { scroll: false });
      }
    });
  };

  const handleClear = () => {
    handleInputChange('');
  };

  return (
    <search className="navbar-search-wrapper">
      <label htmlFor="navbar-search-input" className="sr-only">
        ค้นหาชื่องานคอนเสิร์ต ศิลปิน หรือสถานที่
      </label>
      <div className="navbar-search-bar">
        <SearchIcon className="navbar-search-icon" />
        <input
          id="navbar-search-input"
          type="search"
          value={searchTerm}
          onChange={e => handleInputChange(e.target.value)}
          placeholder="ค้นหาชื่องานคอนเสิร์ต หรือสถานที่..."
          aria-label="ค้นหาชื่องานคอนเสิร์ต หรือสถานที่"
          className="navbar-search-input"
          autoComplete="off"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={handleClear}
            className="navbar-search-clear-btn"
            aria-label="ล้างคำค้นหา"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </search>
  );
}
