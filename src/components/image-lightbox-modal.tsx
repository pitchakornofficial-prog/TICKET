'use client';

import { useEffect, useCallback } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

interface ImageLightboxModalProps {
  isOpen: boolean;
  imageUrl: string;
  imageAlt: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export function ImageLightboxModal({
  isOpen,
  imageUrl,
  imageAlt,
  onClose,
  onPrev,
  onNext,
}: ImageLightboxModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && onPrev) {
        onPrev();
      } else if (e.key === 'ArrowRight' && onNext) {
        onNext();
      }
    },
    [onClose, onPrev, onNext],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={imageAlt || 'ขยายรูปภาพ'}
      className="image-lightbox-backdrop"
    >
      {/* Click backdrop to close */}
      <button
        type="button"
        tabIndex={-1}
        className="image-lightbox-backdrop-click"
        onClick={onClose}
        aria-label="ปิดหน้าต่างรูปภาพ"
      />

      <div className="image-lightbox-content">
        {onPrev && (
          <button
            type="button"
            className="image-lightbox-nav-btn prev-btn"
            onClick={e => {
              e.stopPropagation();
              onPrev();
            }}
            aria-label="รูปภาพก่อนหน้า"
          >
            <ChevronLeftIcon style={{ width: '26px', height: '26px' }} />
          </button>
        )}

        <div className="image-lightbox-img-wrapper">
          {/* biome-ignore lint/performance/noImgElement: lightbox full-view image display */}
          <img
            src={imageUrl}
            alt={imageAlt}
            className="image-lightbox-img"
          />
        </div>

        {onNext && (
          <button
            type="button"
            className="image-lightbox-nav-btn next-btn"
            onClick={e => {
              e.stopPropagation();
              onNext();
            }}
            aria-label="รูปภาพถัดไป"
          >
            <ChevronRightIcon style={{ width: '26px', height: '26px' }} />
          </button>
        )}
      </div>
    </div>
  );
}
