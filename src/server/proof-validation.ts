const PROOF_KEY_PATTERN = /^proofs\/[a-zA-Z0-9._-]+$/;

export interface TransferProofValidationResult {
  valid: boolean;
  transferProofKey: string | null;
  transferProofUrl: string | null;
  error?: string;
}

export function transferProofMediaUrl(key: string | null | undefined): string | null {
  const cleanKey = key?.trim() || null;
  if (!cleanKey || !PROOF_KEY_PATTERN.test(cleanKey) || cleanKey.includes('..')) return null;
  return `/api/media/${encodeURIComponent(cleanKey)}`;
}

/**
 * Validates transfer proof key and URL for payouts and manual refunds.
 * Proofs must use the owner-authorized media route; external storage URLs are never accepted.
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

  let urlKey: string | null = null;
  if (url) {
    if (!url.startsWith('/api/media/') || url.startsWith('//') || url.includes('..') || url.includes('?') || url.includes('#')) {
      return {
        valid: false,
        transferProofKey: null,
        transferProofUrl: null,
        error: 'รูปแบบลิงก์หลักฐานการโอน (transferProofUrl) ไม่ถูกต้อง',
      };
    }
    try {
      const decodedKey = decodeURIComponent(url.slice('/api/media/'.length));
      if (!PROOF_KEY_PATTERN.test(decodedKey) || decodedKey.includes('..')) throw new Error('invalid key');
      urlKey = decodedKey;
    } catch {
      return {
        valid: false,
        transferProofKey: null,
        transferProofUrl: null,
        error: 'รูปแบบลิงก์หลักฐานการโอน (transferProofUrl) ไม่ถูกต้อง',
      };
    }
  }

  if (key && urlKey && key !== urlKey) {
    return {
      valid: false,
      transferProofKey: null,
      transferProofUrl: null,
      error: 'รหัสไฟล์และลิงก์หลักฐานการโอนไม่ตรงกัน',
    };
  }

  const proofKey = key || urlKey;

  return {
    valid: true,
    transferProofKey: proofKey,
    transferProofUrl: transferProofMediaUrl(proofKey),
  };
}
