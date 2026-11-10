'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircleIcon, XIcon } from './icons';
import { AlertIcon } from './alert-icon';

export interface ToastPayload {
  id?: string;
  type: 'success' | 'error' | 'info';
  message: string;
  duration?: number; // in milliseconds, default 5000
}

interface ToastNotificationProps {
  toast?: ToastPayload | null;
  onClose?: () => void;
}

/**
 * Universal Top-Center Floating Toast Notification (D-251)
 * Displays floating alert pinned at top-center under navbar with 5-second countdown timer.
 * Zero Emojis (D-14) 100% compliant.
 */
export function ToastNotification({ toast: propToast, onClose }: ToastNotificationProps) {
  const [activeToast, setActiveToast] = useState<ToastPayload | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(5000);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const totalDurationRef = useRef<number>(5000);

  // Sync propToast if provided
  useEffect(() => {
    if (propToast) {
      setActiveToast(propToast);
      const duration = propToast.duration ?? 5000;
      totalDurationRef.current = duration;
      setRemainingMs(duration);
      setIsPaused(false);
    } else if (propToast === null) {
      setActiveToast(null);
    }
  }, [propToast]);

  // Global event listener for custom 'app-toast' events
  useEffect(() => {
    const handleGlobalToast = (e: Event) => {
      const customEvent = e as CustomEvent<ToastPayload>;
      if (customEvent.detail) {
        setActiveToast(customEvent.detail);
        const duration = customEvent.detail.duration ?? 5000;
        totalDurationRef.current = duration;
        setRemainingMs(duration);
        setIsPaused(false);
      }
    };

    window.addEventListener('app-toast', handleGlobalToast);
    return () => window.removeEventListener('app-toast', handleGlobalToast);
  }, []);

  const handleDismiss = useCallback(() => {
    setActiveToast(null);
    if (onClose) onClose();
  }, [onClose]);

  // Countdown timer effect
  useEffect(() => {
    if (!activeToast || isPaused) return;

    const interval = 100; // tick every 100ms for smooth progress bar
    const timer = setInterval(() => {
      setRemainingMs(prev => {
        if (prev <= interval) {
          clearInterval(timer);
          handleDismiss();
          return 0;
        }
        return prev - interval;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [activeToast, isPaused, handleDismiss]);

  if (!activeToast) return null;

  const secondsLeft = Math.ceil(remainingMs / 1000);
  const progressPercent = Math.max(0, Math.min(100, (remainingMs / totalDurationRef.current) * 100));

  const isSuccess = activeToast.type === 'success';
  const isError = activeToast.type === 'error';

  return (
    <aside
      className={`top-center-toast-notification ${isSuccess ? 'toast-success' : ''} ${isError ? 'toast-error' : ''}`}
      role="status"
      aria-live="polite"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      data-testid="top-center-toast-notification"
    >
      <div className="toast-content-wrapper">
        <div className="toast-icon-wrap" aria-hidden="true">
          {isSuccess ? <CheckCircleIcon className="toast-icon-svg" /> : <AlertIcon className="toast-icon-svg" />}
        </div>
        <div className="toast-message-wrap">
          <p className="toast-message-text">{activeToast.message}</p>
        </div>
        <div className="toast-actions-wrap">
          <span className="toast-timer-pill" title={`ปิดอัตโนมัติใน ${secondsLeft} วินาที`}>
            {secondsLeft} วิ
          </span>
          <button
            type="button"
            className="toast-close-btn"
            onClick={handleDismiss}
            aria-label="ปิดการแจ้งเตือน"
          >
            <XIcon className="toast-close-icon" />
          </button>
        </div>
      </div>
      <div className="toast-progress-track">
        <div
          className="toast-progress-bar"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </aside>
  );
}

/**
 * Helper function to trigger a global toast anywhere in client code
 */
export function triggerToast(payload: ToastPayload) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: payload }));
  }
}
