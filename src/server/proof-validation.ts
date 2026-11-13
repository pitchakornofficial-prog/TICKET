const PROOF_KEY_PATTERN = /^proofs\/[a-zA-Z0-9._-]+$/;

export interface TransferProofValidationResult {
  valid: boolean;
  transferProofKey: string | null;
  transferProofUrl: string | null;
  error?: string;
}

/**
 * Validates transfer proof key and URL for payouts and manual refunds.
 * Keys must live under proofs/ with safe characters; URLs must be /api/media/... or https://.
 */
export function validateTransferProof(
  rawKey?: string | null,
  rawUrl?: string | null,
): TransferProofValidationResult {
  const key = rawKey?.trim() || null;
  const url = rawUrl?.trim() || null;

  if (key && (!PROOF_KEY_PATTERN.test(key) || key.includes('..'))) {
    return {
      valid: false,
      transferProofKey: null,
      transferProofUrl: null,
      error: 'รูปแบบรหัสไฟล์หลักฐานการโอน (transferProofKey) ไม่ถูกต้อง',
    };
  }

  if (url) {
    const isMediaPath = url.startsWith('/api/media/') && !url.startsWith('//') && !url.includes('..');
    let isSafeHttps = false;
    if (!isMediaPath) {
      try {
        const parsed = new URL(url);
        isSafeHttps = parsed.protocol === 'https:';
      } catch {
        isSafeHttps = false;
      }
    }
    if (!isMediaPath && !isSafeHttps) {
      return {
        valid: false,
        transferProofKey: null,
        transferProofUrl: null,
        error: 'รูปแบบลิงก์หลักฐานการโอน (transferProofUrl) ไม่ถูกต้อง',
      };
    }
  }

  return {
    valid: true,
    transferProofKey: key,
    transferProofUrl: url,
  };
}
