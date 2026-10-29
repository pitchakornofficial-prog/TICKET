'use client';

import type React from 'react';
import { useEffect, useCallback } from 'react';
import { XIcon } from '@/components/icons';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  children: React.ReactNode;
  className?: string;
  id?: string;
  'data-testid'?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  children,
  className = '',
  id,
  'data-testid': testId = 'ui-modal',
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        onClose();
      }
    },
    [closeOnEscape, onClose],
  );

  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="ui-modal-backdrop">
      {closeOnOverlayClick && (
        <button
          type="button"
          className="ui-modal-backdrop-btn"
          onClick={onClose}
          aria-label="ปิดหน้าต่าง"
          tabIndex={-1}
        />
      )}
      <div
        className={`ui-modal-dialog ui-modal-${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? `${id || 'modal'}-title` : undefined}
        aria-describedby={description ? `${id || 'modal'}-desc` : undefined}
        id={id}
        data-testid={testId}
      >
        {(title || showCloseButton) && (
          <div className="ui-modal-header">
            <div className="ui-modal-title-group">
              {title && (
                <h3 id={`${id || 'modal'}-title`} className="ui-modal-title">
                  {title}
                </h3>
              )}
              {description && (
                <p id={`${id || 'modal'}-desc`} className="ui-modal-description">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                className="ui-modal-close-btn"
                onClick={onClose}
                aria-label="ปิดหน้าต่าง"
                data-testid={`${testId}-close-btn`}
              >
                <XIcon width={18} height={18} />
              </button>
            )}
          </div>
        )}

        <div className="ui-modal-body">{children}</div>
      </div>
    </div>
  );
}

export interface ModalFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export function ModalFooter({
  className = '',
  children,
  ...props
}: ModalFooterProps) {
  return (
    <div className={`ui-modal-footer ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
