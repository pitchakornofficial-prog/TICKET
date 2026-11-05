'use client';

import { useState, useEffect } from 'react';
import { BookOpenIcon, XMarkIcon } from './icons';

interface ExpandableEventDescriptionProps {
  title?: string;
  description: string;
}

export function ExpandableEventDescription({ title, description }: ExpandableEventDescriptionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const isLongText = description.length > 180;

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isModalOpen]);

  return (
    <div className="event-rich-description">
      <div className="description-summary-wrap">
        <p className="description-summary-text">
          {description}
        </p>
        {isLongText && (
          <div className="description-fade-overlay" aria-hidden="true" />
        )}
      </div>

      {isLongText && (
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="description-modal-open-btn"
          aria-haspopup="dialog"
          aria-expanded={isModalOpen}
        >
          <BookOpenIcon style={{ width: '16px', height: '16px' }} />
          <span>อ่านรายละเอียดทั้งหมด</span>
        </button>
      )}

      {/* Full Description Modal Dialog (D-145) */}
      {isModalOpen && (
        <div
          className="description-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="desc-modal-title"
        >
          <button
            type="button"
            className="description-modal-backdrop-click"
            aria-label="ปิดหน้าต่าง"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="description-modal-card">
            <div className="description-modal-header">
              <div>
                <h3 id="desc-modal-title" className="description-modal-title">
                  รายละเอียดคอนเสิร์ตฉบับเต็ม
                </h3>
                {title && <span className="description-modal-subtitle">{title}</span>}
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="description-modal-close-btn"
                aria-label="ปิดหน้าต่างรายละเอียด"
              >
                <XMarkIcon style={{ width: '20px', height: '20px' }} />
              </button>
            </div>

            <div className="description-modal-body">
              <div className="description-modal-full-text">
                {description}
              </div>
            </div>

            <div className="description-modal-footer">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="secondary-button button-link description-modal-done-btn"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
