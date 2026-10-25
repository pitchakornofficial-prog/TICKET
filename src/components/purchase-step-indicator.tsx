'use client';

import Link from 'next/link';
import { CheckCircleIcon } from './icons';

export type PurchaseStep = 'details' | 'queue' | 'checkout' | 'payment';

interface PurchaseStepIndicatorProps {
  currentStep: PurchaseStep;
  eventId?: string;
  orderId?: string;
}

const STEPS: { key: 'details' | 'checkout' | 'payment'; number: number; label: string; shortLabel: string }[] = [
  { key: 'details', number: 1, label: 'รายละเอียดคอนเสิร์ต', shortLabel: 'รายละเอียด' },
  { key: 'checkout', number: 2, label: 'เลือกรอบและประเภทบัตร', shortLabel: 'เลือกบัตร' },
  { key: 'payment', number: 3, label: 'ชำระเงิน', shortLabel: 'ชำระเงิน' },
];

export function PurchaseStepIndicator({
  currentStep,
  eventId,
}: PurchaseStepIndicatorProps) {
  // Map 'queue' to step 2 (checkout) as an active transition state
  const activeKey = currentStep === 'queue' ? 'checkout' : currentStep;
  const currentIdx = STEPS.findIndex(s => s.key === activeKey);

  return (
    <nav className="purchase-stepper-card" aria-label="ขั้นตอนการซื้อบัตร" data-testid="purchase-step-indicator">
      <ol className="purchase-stepper-list">
        {STEPS.map((step, idx) => {
          const isCompleted = idx < currentIdx;
          const isActive = idx === currentIdx;
          const statusClass = isActive
            ? 'step-active'
            : isCompleted
              ? 'step-completed'
              : 'step-upcoming';

          const stepContent = (
            <div className={`purchase-step-item ${statusClass}`} aria-current={isActive ? 'step' : undefined}>
              <span className="purchase-step-circle">
                {isCompleted ? (
                  <CheckCircleIcon style={{ width: '18px', height: '18px' }} />
                ) : (
                  step.number
                )}
              </span>
              <div className="purchase-step-text">
                <span className="purchase-step-label-full">{step.label}</span>
                <span className="purchase-step-label-short">{step.shortLabel}</span>
              </div>
            </div>
          );

          return (
            <li key={step.key} className="purchase-step-li">
              {step.key === 'details' && eventId && isCompleted ? (
                <Link href={`/events/${eventId}`} className="purchase-step-link">
                  {stepContent}
                </Link>
              ) : (
                stepContent
              )}
              {idx < STEPS.length - 1 && (
                <div
                  className={`purchase-step-connector ${idx < currentIdx ? 'connector-completed' : ''}`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
