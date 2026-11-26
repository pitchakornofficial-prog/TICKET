export interface SegmentedTicketParts {
  orderPart: string;
  indexPart: string;
  suffixPart: string;
}

/**
 * Parse a "TK-XXXX-%-RRRRRRRR" pattern used when disambiguating an 8-char suffix
 * with the 4-char order suffix before the 2-digit ticket index is provided.
 */
export function parseOrderAndSuffixPattern(
  value: string,
): { orderPart: string; suffixPart: string } | null {
  const match = /^TK-([0-9A-Z]{4})-%-([0-9A-Z]{8})$/i.exec(value.trim());
  if (!match) return null;
  return {
    orderPart: match[1].toUpperCase(),
    suffixPart: match[2].toUpperCase(),
  };
}

/**
 * Build the admission lookup string from segmented input boxes.
 */
export function buildSegmentedTicketQuery(parts: SegmentedTicketParts): string {
  const order = parts.orderPart.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 4);
  const index = parts.indexPart.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 2);
  const suffixRaw = parts.suffixPart.trim();

  if (/^tkt-qr-/i.test(suffixRaw)) {
    return suffixRaw;
  }

  const suffix = suffixRaw.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 8);
  if (!suffix) return '';

  if (order.length === 4 && index.length === 2 && suffix.length === 8) {
    return `TK-${order}-${index}-${suffix}`;
  }
  if (order.length === 4 && suffix.length === 8) {
    return `TK-${order}-%-${suffix}`;
  }
  return suffix;
}

/**
 * Parse a pasted full ticket code (TK-XXXX-NN-RRRRRRRR) or QR payload (TKT-QR-...).
 */
export function parsePastedTicketSegments(
  raw: string,
): ({ rawQrPayload: string } | SegmentedTicketParts) | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^tkt-qr-/i.test(trimmed)) {
    return { rawQrPayload: trimmed };
  }

  const fullMatch = /^TK-([0-9A-Z]{4})-([0-9A-Z]{2})-([0-9A-Z]{8})$/i.exec(trimmed);
  if (fullMatch) {
    return {
      orderPart: fullMatch[1].toUpperCase(),
      indexPart: fullMatch[2].toUpperCase(),
      suffixPart: fullMatch[3].toUpperCase(),
    };
  }

  const compact = trimmed.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (/^[0-9A-Z]{14}$/.test(compact)) {
    return {
      orderPart: compact.slice(0, 4),
      indexPart: compact.slice(4, 6),
      suffixPart: compact.slice(6, 14),
    };
  }

  return null;
}

/**
 * Check whether an input string matches the 8-character ticket suffix shortcut (RRRRRRRR).
 */
export function isTicketSuffixShortcut(value: string): boolean {
  return /^[0-9A-Za-z]{8}$/.test(value.trim());
}

/**
 * Format manual ticket code entry into TK-XXXX-NN-RRRRRRRR while preserving:
 * - Full QR payloads (TKT-QR-...) from 2D USB/Bluetooth scanners
 * - Short 1-8 character suffix shortcuts (e.g. 9C4E12B0)
 */
export function formatTicketCodeInput(rawValue: string, prevValue = ''): string {
  const trimmed = rawValue.trim();
  if (!trimmed) return '';

  // Never alter QR payloads from 2D barcode scanners or clipboard paste
  if (/^tkt-qr-/i.test(trimmed)) {
    return trimmed;
  }

  const upper = trimmed.toUpperCase();
  const hasTkPrefix = upper.startsWith('TK-') || (upper.startsWith('TK') && upper.length > 2);
  const hasDash = upper.includes('-');

  // Keep pure 1-8 character inputs un-prefixed so the 8-char suffix shortcut works seamlessly
  const rawAlphaNum = upper.replace(/[^0-9A-Z]/g, '');
  if (!hasTkPrefix && !hasDash && rawAlphaNum.length <= 8) {
    return rawAlphaNum;
  }

  // Allow smooth backspacing out of the "TK-" prefix
  if (rawValue.length < prevValue.length && (upper === 'TK' || upper === 'T')) {
    return upper;
  }

  const body = hasTkPrefix ? rawAlphaNum.slice(2) : rawAlphaNum;
  if (!body) {
    return upper.startsWith('TK') ? 'TK-' : '';
  }

  const part1 = body.slice(0, 4);
  const part2 = body.slice(4, 6);
  const part3 = body.slice(6, 14);

  const segments = ['TK', part1];
  if (part2) segments.push(part2);
  if (part3) segments.push(part3);
  return segments.join('-');
}
