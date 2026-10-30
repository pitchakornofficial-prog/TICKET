'use client';

import { useState, useEffect, useRef, useTransition, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SearchIcon, MapPinIcon } from './icons';
import { TicketIcon } from './ticket-icon';

interface SearchEventItem {
  id: string;
  title: string;
  location: string;
  startingPrice: number;
  status: string;
}

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text;
  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);
  return (
    <>
      {before}
      <strong className="suggestion-matched-text">{match}</strong>
      {after}
    </>
  );
}

export function NavbarSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [searchTerm, setSearchTerm] = useState(initialQuery);
  const [events, setEvents] = useState<SearchEventItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  // Sync state if URL changes externally (e.g. back button or clear search)
  useEffect(() => {
    const q = searchParams.get('q') || '';
    setSearchTerm(q);
  }, [searchParams]);

  // Load events once for fast instant client-side autocomplete
  useEffect(() => {
    let active = true;
    fetch('/api/public/events')
      .then(res => res.json())
      .then(data => {
        if (active && Array.isArray(data.events)) {
          setEvents(data.events);
        }
      })
      .catch(() => {
        // Fallback gracefully if API is temporarily unavailable
      });
    return () => {
      active = false;
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle Escape key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Broadcast search query to page listener and sync with URL
  const handleInputChange = (value: string) => {
    setSearchTerm(value);
    setIsOpen(Boolean(value.trim()));

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
    setIsOpen(false);
  };

  const handleSelectEvent = (id: string) => {
    setIsOpen(false);
    router.push(`/events/${id}`);
  };

  const handleSelectLocation = (loc: string) => {
    handleInputChange(loc);
    setIsOpen(false);
  };

  // Suggestions filtering
  const trimmed = searchTerm.trim().toLowerCase();
  const matchedConcerts = useMemo(() => {
    if (!trimmed) return [];
    return events
      .filter(ev => ev.title.toLowerCase().includes(trimmed))
      .slice(0, 5);
  }, [events, trimmed]);

  const matchedLocations = useMemo(() => {
    if (!trimmed) return [];
    const locSet = new Set<string>();
    for (const ev of events) {
      if (ev.location?.toLowerCase().includes(trimmed)) {
        locSet.add(ev.location);
      }
    }
    return Array.from(locSet).slice(0, 3);
  }, [events, trimmed]);

  const hasSuggestions = matchedConcerts.length > 0 || matchedLocations.length > 0;

  return (
    <search ref={wrapperRef} className="navbar-search-wrapper" onKeyDown={handleKeyDown}>
      <label htmlFor="navbar-search-input" className="sr-only">
        ค้นหาชื่องานคอนเสิร์ต ศิลปิน หรือสถานที่
      </label>
      <div className="navbar-search-bar">
        <SearchIcon className="navbar-search-icon" />
        <input
          id="navbar-search-input"
          type="search"
          role="combobox"
          value={searchTerm}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={() => {
            if (searchTerm.trim()) {
              setIsOpen(true);
            }
          }}
          placeholder="ค้นหาชื่องานคอนเสิร์ต หรือสถานที่..."
          aria-label="ค้นหาชื่องานคอนเสิร์ต หรือสถานที่"
          aria-autocomplete="list"
          aria-expanded={isOpen && trimmed.length > 0}
          aria-controls="navbar-search-listbox"
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

      {isOpen && trimmed.length > 0 && (
        <div id="navbar-search-listbox" className="navbar-search-dropdown" role="listbox" aria-label="คำค้นหาที่แนะนำ">
          {hasSuggestions ? (
            <>
              {matchedConcerts.length > 0 && (
                <div className="suggestion-group">
                  <div className="suggestion-group-header">
                    <span>งานคอนเสิร์ตที่แนะนำ</span>
                  </div>
                  {matchedConcerts.map(ev => (
                    <button
                      key={ev.id}
                      type="button"
                      className="suggestion-item suggestion-concert-item"
                      onClick={() => handleSelectEvent(ev.id)}
                    >
                      <div className="suggestion-icon-wrap concert-icon-wrap" aria-hidden="true">
                        <TicketIcon className="suggestion-icon" />
                      </div>
                      <div className="suggestion-info">
                        <div className="suggestion-primary-text">
                          {highlightMatch(ev.title, trimmed)}
                        </div>
                        <div className="suggestion-secondary-text">
                          {ev.location}
                        </div>
                      </div>
                      <div className="suggestion-action-meta">
                        <span className="suggestion-price">
                          เริ่มต้น ฿{ev.startingPrice.toLocaleString('th-TH')}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {matchedLocations.length > 0 && (
                <div className="suggestion-group">
                  <div className="suggestion-group-header">
                    <span>สถานที่จัดงาน</span>
                  </div>
                  {matchedLocations.map(loc => (
                    <button
                      key={loc}
                      type="button"
                      className="suggestion-item suggestion-location-item"
                      onClick={() => handleSelectLocation(loc)}
                    >
                      <div className="suggestion-icon-wrap location-icon-wrap" aria-hidden="true">
                        <MapPinIcon className="suggestion-icon" />
                      </div>
                      <div className="suggestion-info">
                        <div className="suggestion-primary-text">
                          {highlightMatch(loc, trimmed)}
                        </div>
                        <div className="suggestion-secondary-text">
                          ค้นหาคอนเสิร์ตที่จัดขึ้นที่สถานที่นี้
                        </div>
                      </div>
                      <div className="suggestion-action-meta">
                        <span className="suggestion-tag">สถานที่</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="suggestion-empty">
              <SearchIcon className="suggestion-empty-icon" />
              <p>ไม่พบคอนเสิร์ตหรือสถานที่ที่ตรงกับ "{searchTerm}"</p>
              <span className="suggestion-empty-hint">ลองพิมพ์ชื่อย่อหรือตรวจสอบตัวสะกดอีกครั้ง</span>
            </div>
          )}
          <div className="suggestion-footer">
            <span>กด Esc เพื่อปิด · เลือกเพื่อดูคอนเสิร์ต</span>
          </div>
        </div>
      )}
    </search>
  );
}
