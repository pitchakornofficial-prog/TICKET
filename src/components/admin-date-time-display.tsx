'use client';

import { useState, useEffect } from 'react';
import { ClockIcon } from '@/components/icons';

export function AdminDateTimeDisplay() {
  const [mounted, setMounted] = useState(false);
  const [dateTimeStr, setDateTimeStr] = useState('');

  useEffect(() => {
    setMounted(true);
    const updateTime = () => {
      const now = new Date();
      const day = now.toLocaleDateString('th-TH', {
        day: 'numeric',
        timeZone: 'Asia/Bangkok',
      });
      const month = now.toLocaleDateString('th-TH', {
        month: 'long',
        timeZone: 'Asia/Bangkok',
      });
      const year = now.toLocaleDateString('th-TH', {
        year: 'numeric',
        timeZone: 'Asia/Bangkok',
      });
      const time = now.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Bangkok',
      });

      setDateTimeStr(`${day} ${month} ${year} : ${time} น.`);
    };

    updateTime();
    const timer = setInterval(updateTime, 30000);

    // Dynamic sticky header height sync (D-249)
    const topbar = document.querySelector('.admin-topbar') as HTMLElement | null;
    let ro: ResizeObserver | null = null;
    const updateHeight = () => {
      if (topbar) {
        document.documentElement.style.setProperty('--admin-topbar-height', `${topbar.offsetHeight}px`);
      }
    };
    if (topbar) {
      updateHeight();
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => updateHeight());
        ro.observe(topbar);
      }
      window.addEventListener('resize', updateHeight);
    }

    return () => {
      clearInterval(timer);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  return (
    <div className="admin-topbar-clock-plain" title="วันและเวลาปัจจุบัน (Asia/Bangkok)">
      <ClockIcon className="admin-clock-icon-plain" aria-hidden="true" />
      <span className="admin-clock-text-plain">
        {mounted ? dateTimeStr : 'เวลาประเทศไทย (ICT)'}
      </span>
    </div>
  );
}
