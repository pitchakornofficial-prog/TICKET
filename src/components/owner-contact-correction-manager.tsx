'use client';

import { OwnerCustomerHub } from './owner-customer-hub';

/**
 * OwnerContactCorrectionManager (AC-76, G-24, D-250)
 * Re-exports the unified OwnerCustomerHub with full backward compatibility.
 */
export function OwnerContactCorrectionManager() {
  return <OwnerCustomerHub />;
}
