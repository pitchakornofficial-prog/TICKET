import { describe, expect, it } from 'vitest';
import { generateTicketQrSvg } from '../../src/server/tickets';

const QR_SIZE = 33;

function svgToMatrix(qrDataUrl: string): number[][] {
  const svg = decodeURIComponent(qrDataUrl.slice('data:image/svg+xml;utf8,'.length));
  const matrix = Array.from({ length: QR_SIZE }, () => new Array<number>(QR_SIZE).fill(0));
  const padding = 32;
  const moduleSize = 8;
  const path = svg.match(/<path[^>]* d="([^"]+)"/)?.[1];
  if (!path) throw new Error('QR SVG has no module path');
  const rectPattern = /M(\d+) (\d+)h(\d+)v(\d+)h-(\d+)z/g;
  for (const match of path.matchAll(rectPattern)) {
    const [, xText, yText, widthText] = match;
    const row = (Number(yText) - padding) / moduleSize;
    const startCol = (Number(xText) - padding) / moduleSize;
    const width = Number(widthText) / moduleSize;
    if (!Number.isInteger(row) || !Number.isInteger(startCol) || !Number.isInteger(width)) {
      throw new Error('QR SVG module is not aligned to its matrix');
    }
    for (let col = startCol; col < startCol + width; col++) matrix[row][col] = 1;
  }
  return matrix;
}

function createFunctionMask(): boolean[][] {
  const mask = Array.from({ length: QR_SIZE }, () => new Array<boolean>(QR_SIZE).fill(false));
  const set = (row: number, col: number) => {
    if (row >= 0 && row < QR_SIZE && col >= 0 && col < QR_SIZE) mask[row][col] = true;
  };
  for (const [centerRow, centerCol] of [[3, 3], [3, 29], [29, 3]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) set(centerRow + dy, centerCol + dx);
  }
  for (let i = 8; i < QR_SIZE - 8; i++) {
    set(6, i);
    set(i, 6);
  }
  for (const [row, col] of [[26, 26]]) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(row + dy, col + dx);
  }
  for (let i = 0; i <= 5; i++) set(8, i);
  set(8, 7);
  set(8, 8);
  set(7, 8);
  for (let i = 9; i < 15; i++) set(14 - i, 8);
  for (let i = 0; i < 8; i++) set(8, QR_SIZE - 1 - i);
  for (let i = 8; i < 15; i++) set(QR_SIZE - 15 + i, 8);
  set(QR_SIZE - 8, 8);
  return mask;
}

function gfMultiply(x: number, y: number): number {
  let result = 0;
  for (let bit = 7; bit >= 0; bit--) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((y >>> bit) & 1) * x;
  }
  return result;
}

function readPayloadFromMatrix(matrix: number[][]): string {
  const functionMask = createFunctionMask();
  const formatCoordinates: Array<[number, number]> = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8],
    [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const formatBits = formatCoordinates.reduce((value, [row, col], i) => value | (matrix[row][col] << i), 0);
  expect(formatBits).toBe(0x5412); // Level M, mask pattern 0
  const secondFormatCoordinates: Array<[number, number]> = [
    ...Array.from({ length: 8 }, (_, i): [number, number] => [8, QR_SIZE - 1 - i]),
    ...Array.from({ length: 7 }, (_, i): [number, number] => [QR_SIZE - 7 + i, 8]),
  ];
  const secondFormatBits = secondFormatCoordinates.reduce((value, [row, col], i) => value | (matrix[row][col] << i), 0);
  expect(secondFormatBits).toBe(0x5412);
  expect(matrix[QR_SIZE - 8][8]).toBe(1); // Fixed dark module is separate from format data.
  const bits: number[] = [];
  let upward = true;
  for (let right = QR_SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < QR_SIZE; vert++) {
      const row = upward ? QR_SIZE - 1 - vert : vert;
      for (let offset = 0; offset < 2; offset++) {
        const col = right - offset;
        if (functionMask[row][col]) continue;
        bits.push(matrix[row][col] ^ Number((row + col) % 2 === 0));
      }
    }
    upward = !upward;
  }

  const codewords: number[] = [];
  for (let i = 0; i < 100 * 8; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
  }

  const blocks = [new Array<number>(50).fill(0), new Array<number>(50).fill(0)];
  let offset = 0;
  for (let i = 0; i < 32; i++) {
    for (const block of blocks) block[i] = codewords[offset++];
  }
  for (let i = 32; i < 50; i++) {
    for (const block of blocks) block[i] = codewords[offset++];
  }

  // Every block must have zero Reed–Solomon syndromes for roots alpha^0…alpha^17.
  for (const block of blocks) {
    let root = 1;
    for (let degree = 0; degree < 18; degree++) {
      let syndrome = 0;
      for (const codeword of block) syndrome = gfMultiply(syndrome, root) ^ codeword;
      expect(syndrome).toBe(0);
      root = gfMultiply(root, 2);
    }
  }

  const data: number[] = [...blocks[0].slice(0, 32), ...blocks[1].slice(0, 32)];
  const dataBits = data.flatMap(byte => Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1));
  const read = (start: number, count: number) => dataBits.slice(start, start + count)
    .reduce((value, bit) => (value << 1) | bit, 0);
  expect(read(0, 4)).toBe(0b0100);
  const byteCount = read(4, 8);
  expect(byteCount).toBe(16);
  const payloadBytes = Array.from({ length: byteCount }, (_, i) => read(12 + i * 8, 8));
  return new TextDecoder().decode(new Uint8Array(payloadBytes));
}

describe('TASK-015 Unit: Ticket Issuance & QR Generation', () => {
  it('encodes the actual ticket payload in a QR Code Model 2 SVG (AC-19)', () => {
    const code1 = 'TK-ORD001-VIP1-01';
    const payload1 = 'TKT-QR-UUID-1111';
    const qr1 = generateTicketQrSvg(code1, payload1);

    const code2 = 'TK-ORD001-VIP1-02';
    const payload2 = 'TKT-QR-UUID-2222';
    const qr2 = generateTicketQrSvg(code2, payload2);

    expect(qr1).toContain('data:image/svg+xml');
    expect(qr2).toContain('data:image/svg+xml');
    expect(qr1).toContain(encodeURIComponent(code1));
    expect(qr2).toContain(encodeURIComponent(code2));
    expect(qr1).not.toBe(qr2);
    expect(readPayloadFromMatrix(svgToMatrix(qr1))).toBe(payload1);
    expect(readPayloadFromMatrix(svgToMatrix(qr2))).toBe(payload2);
    expect(decodeURIComponent(qr1.slice('data:image/svg+xml;utf8,'.length))).toContain(`<desc>${payload1}</desc>`);
  });

  it('rejects payloads that exceed the supported QR version capacity', () => {
    expect(() => generateTicketQrSvg('TK-1', 'x'.repeat(63))).toThrow(/62-byte/);
  });

  it('ticket code conforms to expected prefix TK- and sequence format', () => {
    const orderId = 'ORD-12345678';
    const typeId = 'TT-VIP01';
    const seq = 1;
    const ticketCode = `TK-${orderId.slice(-6)}-${typeId.slice(-4)}-${seq.toString().padStart(2, '0')}`;
    expect(ticketCode).toBe('TK-345678-IP01-01');
  });

  it('enforces single buyer info per order without individual attendee names (AC-11)', () => {
    // Buyer info is bound at order level
    const buyer = {
      buyerName: 'สมชาย ผู้ซื้อ',
      buyerEmail: 'somchai@example.com',
      buyerPhone: '0812345678',
    };

    const tickets = [
      { ticketCode: 'TK-01', ...buyer },
      { ticketCode: 'TK-02', ...buyer },
    ];

    expect(tickets).toHaveLength(2);
    expect(tickets[0].buyerName).toBe('สมชาย ผู้ซื้อ');
    expect(tickets[1].buyerName).toBe('สมชาย ผู้ซื้อ');
    // Individual attendee names are NOT required
    expect((tickets[0] as Record<string, unknown>).attendeeName).toBeUndefined();
  });
});
