'use client';

import { OwnerFinanceHub } from './owner-finance-hub';

export interface EventOption {
  id: string;
  title: string;
}

/**
 * OwnerWeeklyPayoutManager (AC-27, AC-30, AC-79, AC-92, D-252)
 * Re-exports the unified OwnerFinanceHub with full backward compatibility.
 */
export function OwnerWeeklyPayoutManager() {
  return <OwnerFinanceHub />;
}
