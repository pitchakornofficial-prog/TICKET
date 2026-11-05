'use client';

import { useState } from 'react';
import { TicketIcon } from './ticket-icon';
import { ImageLightboxModal } from './image-lightbox-modal';

interface EventInteractivePosterProps {
  posterUrl?: string | null;
  title: string;
}

export function EventInteractivePoster({
  posterUrl,
  title,
}: EventInteractivePosterProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  return (
    <>
      <div className="category-vertical-poster-card">
        {posterUrl ? (
          <button
            type="button"
            className="category-vertical-poster-btn"
            onClick={() => setIsLightboxOpen(true)}
            aria-label={`คลิกเพื่อดูโปสเตอร์ ${title} ขนาดใหญ่`}
          >
            {/* biome-ignore lint/performance/noImgElement: sharp 4:5 vertical poster */}
            <img
              src={posterUrl}
              alt={`โปสเตอร์ ${title}`}
              className="category-vertical-poster-img"
            />
            <span className="poster-zoom-hint" aria-hidden="true">
              คลิกเพื่อดูภาพขนาดใหญ่
            </span>
          </button>
        ) : (
          <div className="category-vertical-poster-placeholder">
            <TicketIcon />
            <span>LIVE POSTER</span>
          </div>
        )}
      </div>

      {posterUrl && (
        <ImageLightboxModal
          isOpen={isLightboxOpen}
          imageUrl={posterUrl}
          imageAlt={`โปสเตอร์ ${title}`}
          onClose={() => setIsLightboxOpen(false)}
        />
      )}
    </>
  );
}
