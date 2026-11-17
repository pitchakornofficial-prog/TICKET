// Zero-dependency MIME & RFC 2047 email parser for Amazon SES inbound emails

export interface ParsedEmailAddress {
  name: string;
  address: string;
}

export interface ParsedMimeAttachment {
  filename: string;
  contentType: string;
  size: number;
}

export interface ParsedMimeEmail {
  from: ParsedEmailAddress;
  to: ParsedEmailAddress[];
  replyTo: string | null;
  subject: string;
  messageId: string | null;
  date: string | null;
  textBody: string;
  htmlBody: string | null;
  attachments: ParsedMimeAttachment[];
  headers: Record<string, string>;
}

const MAX_MIME_DEPTH = 10;

function decodeCharset(bytes: Uint8Array, charsetRaw: string): string {
  const normalized = charsetRaw.trim().toLowerCase().replace(/^["']|["']$/g, '');
  const map: Record<string, string> = {
    'utf-8': 'utf-8',
    utf8: 'utf-8',
    'us-ascii': 'ascii',
    ascii: 'ascii',
    'iso-8859-1': 'iso-8859-1',
    latin1: 'iso-8859-1',
    'windows-874': 'windows-874',
    'tis-620': 'windows-874',
    cp874: 'windows-874',
  };
  const label = map[normalized] || 'utf-8';
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

function decodeQuotedPrintableBytes(input: string): Uint8Array {
  const cleaned = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '=' && i + 2 < cleaned.length && /^[0-9a-fA-F]{2}$/.test(cleaned.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const cp = cleaned.codePointAt(i) ?? 0;
      if (cp <= 0x7f) {
        bytes.push(cp);
      } else {
        const ch = String.fromCodePoint(cp);
        for (const b of Buffer.from(ch, 'utf8')) {
          bytes.push(b);
        }
        if (cp > 0xffff) i++;
      }
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Decodes RFC 2047 encoded words such as =?UTF-8?B?...?= and =?UTF-8?Q?...?=
 */
export function decodeRfc2047(value: string): string {
  if (!value?.includes('=?')) return value;
  // Adjacent encoded words separated only by whitespace should have the whitespace removed per RFC 2047
  const collapsed = value.replace(/\?=\s+=\?/g, '?==?');
  return collapsed.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
    (_full, charset: string, encoding: string, text: string) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          const buf = Buffer.from(text, 'base64');
          return decodeCharset(new Uint8Array(buf), charset);
        }
        const qpText = text.replaceAll('_', ' ');
        return decodeCharset(decodeQuotedPrintableBytes(qpText), charset);
      } catch {
        return text;
      }
    },
  );
}

export function parseEmailAddress(raw: string): ParsedEmailAddress {
  const decoded = decodeRfc2047(raw).trim();
  const angleMatch = decoded.match(/^(.*?)<([^<>]+)>\s*$/);
  if (angleMatch) {
    const rawName = angleMatch[1].trim().replace(/^["']|["']$/g, '').trim();
    const address = angleMatch[2].trim().toLowerCase();
    return { name: rawName, address };
  }
  const simpleMatch = decoded.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (simpleMatch) {
    return { name: '', address: simpleMatch[1].toLowerCase() };
  }
  return { name: '', address: decoded.toLowerCase() };
}

export function parseEmailAddressList(raw: string): ParsedEmailAddress[] {
  if (!raw.trim()) return [];
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let inAngles = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"' && raw[i - 1] !== '\\') inQuotes = !inQuotes;
    else if (ch === '<' && !inQuotes) inAngles = true;
    else if (ch === '>' && !inQuotes) inAngles = false;
    else if (ch === ',' && !inQuotes && !inAngles) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.map(parseEmailAddress).filter((a) => Boolean(a.address));
}

function splitHeadersAndBody(raw: string): { rawHeaders: string; body: string } {
  const crlfIdx = raw.indexOf('\r\n\r\n');
  const lfIdx = raw.indexOf('\n\n');
  if (crlfIdx !== -1 && (lfIdx === -1 || crlfIdx < lfIdx)) {
    return {
      rawHeaders: raw.slice(0, crlfIdx),
      body: raw.slice(crlfIdx + 4),
    };
  }
  if (lfIdx !== -1) {
    return {
      rawHeaders: raw.slice(0, lfIdx),
      body: raw.slice(lfIdx + 2),
    };
  }
  return { rawHeaders: raw, body: '' };
}

function parseHeaders(rawHeaders: string): Record<string, string> {
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, ' ');
  const lines = unfolded.split(/\r?\n/);
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();
    if (headers[key]) {
      headers[key] = `${headers[key]}, ${val}`;
    } else {
      headers[key] = val;
    }
  }
  return headers;
}

function extractHeaderParam(headerValue: string, paramName: string): string | null {
  const regex = new RegExp(`(?:^|;)\\s*${paramName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^;\\s]+))`, 'i');
  const match = headerValue.match(regex);
  if (!match) return null;
  return (match[1] ?? match[2] ?? match[3] ?? '').trim() || null;
}

function decodeBodyContent(body: string, transferEncoding: string, charset: string): string {
  const enc = transferEncoding.trim().toLowerCase();
  if (enc === 'base64') {
    const cleanB64 = body.replace(/\s+/g, '');
    const buf = Buffer.from(cleanB64, 'base64');
    return decodeCharset(new Uint8Array(buf), charset);
  }
  if (enc === 'quoted-printable') {
    return decodeCharset(decodeQuotedPrintableBytes(body), charset);
  }
  return body;
}

function estimateBinarySize(body: string, transferEncoding: string): number {
  const enc = transferEncoding.trim().toLowerCase();
  if (enc === 'base64') {
    const clean = body.replace(/\s+/g, '');
    const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
  }
  return Buffer.byteLength(body, 'utf8');
}

function parseMimePart(
  rawPart: string,
  state: { textParts: string[]; htmlParts: string[]; attachments: ParsedMimeAttachment[] },
  depth = 0,
): void {
  if (depth > MAX_MIME_DEPTH) return;
  const { rawHeaders, body } = splitHeadersAndBody(rawPart);
  const headers = parseHeaders(rawHeaders);

  const contentTypeRaw = headers['content-type'] || 'text/plain; charset=utf-8';
  const mimeType = contentTypeRaw.split(';')[0].trim().toLowerCase();
  const boundary = extractHeaderParam(contentTypeRaw, 'boundary');
  const charset = extractHeaderParam(contentTypeRaw, 'charset') || 'utf-8';
  const transferEncoding = headers['content-transfer-encoding'] || '7bit';
  const disposition = headers['content-disposition'] || '';
  const filenameRaw =
    extractHeaderParam(disposition, 'filename') ||
    extractHeaderParam(contentTypeRaw, 'name');
  const filename = filenameRaw ? decodeRfc2047(filenameRaw) : null;

  if (mimeType.startsWith('multipart/') && boundary) {
    const delimiter = `--${boundary}`;
    const segments = body.split(delimiter);
    for (let i = 1; i < segments.length; i++) {
      let segment = segments[i];
      if (segment.startsWith('--')) break; // closing boundary
      if (segment.startsWith('\r\n')) segment = segment.slice(2);
      else if (segment.startsWith('\n')) segment = segment.slice(1);
      // Trim trailing newline right before next boundary
      segment = segment.replace(/\r?\n$/, '');
      parseMimePart(segment, state, depth + 1);
    }
    return;
  }

  const isAttachment =
    disposition.toLowerCase().startsWith('attachment') ||
    (Boolean(filename) && mimeType !== 'text/plain' && mimeType !== 'text/html');

  if (isAttachment || (!mimeType.startsWith('text/') && mimeType !== 'message/rfc822')) {
    state.attachments.push({
      filename: filename || `attachment.${mimeType.split('/')[1] || 'bin'}`,
      contentType: mimeType,
      size: estimateBinarySize(body, transferEncoding),
    });
    return;
  }

  const decoded = decodeBodyContent(body, transferEncoding, charset).trim();
  if (!decoded) return;

  if (mimeType === 'text/html') {
    state.htmlParts.push(decoded);
  } else {
    state.textParts.push(decoded);
  }
}

/**
 * Parses a raw RFC 5322 / MIME email into structured metadata, bodies, and attachments.
 */
export function parseRawMimeEmail(rawMime: string): ParsedMimeEmail {
  const { rawHeaders } = splitHeadersAndBody(rawMime);
  const headers = parseHeaders(rawHeaders);

  const from = parseEmailAddress(headers.from || '');
  const to = parseEmailAddressList(headers.to || '');
  const replyToParsed = headers['reply-to'] ? parseEmailAddress(headers['reply-to']) : null;
  const replyTo = replyToParsed?.address || null;
  const subject = decodeRfc2047(headers.subject || '').trim();
  const messageId = headers['message-id']?.trim() || null;
  const date = headers.date?.trim() || null;

  const state = {
    textParts: [] as string[],
    htmlParts: [] as string[],
    attachments: [] as ParsedMimeAttachment[],
  };
  parseMimePart(rawMime, state, 0);

  return {
    from,
    to,
    replyTo,
    subject,
    messageId,
    date,
    textBody: state.textParts.join('\n\n'),
    htmlBody: state.htmlParts.length > 0 ? state.htmlParts.join('\n') : null,
    attachments: state.attachments,
    headers,
  };
}
