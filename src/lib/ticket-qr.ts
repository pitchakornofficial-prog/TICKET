/**
 * Minimal QR Code Model 2 encoder for ticket payloads.
 * Version 4 / error correction M holds up to 62 UTF-8 bytes in byte mode.
 * Safe for use in both browser/client and Node.js server environments.
 */

const VERSION = 4;
const SIZE = VERSION * 4 + 17;
const DATA_CODEWORDS = 64;
const ECC_CODEWORDS_PER_BLOCK = 18;
const BLOCK_COUNT = 2;
const MASK_PATTERN = 0;
const ALIGNMENT_CENTERS = [6, 26] as const;

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  let result = [1];
  let root = 1;
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(result.length + 1).fill(0);
    for (let j = 0; j < result.length; j++) {
      next[j] ^= result[j];
      next[j + 1] ^= gfMultiply(result[j], root);
    }
    result = next;
    root = gfMultiply(root, 2);
  }
  return result;
}

function reedSolomonRemainder(data: number[], degree: number): number[] {
  const divisor = rsDivisor(degree);
  const remainder = [...data, ...new Array<number>(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = remainder[i];
    if (factor === 0) continue;
    for (let j = 0; j < divisor.length; j++) {
      remainder[i + j] ^= gfMultiply(divisor[j], factor);
    }
  }
  return remainder.slice(data.length);
}

function appendBits(bits: number[], value: number, count: number): void {
  for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

function createDataCodewords(payload: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(payload));
  if (bytes.length > 62) {
    throw new Error('Ticket QR payload exceeds the 62-byte Version 4-M capacity');
  }

  const bits: number[] = [];
  appendBits(bits, 0b0100, 4); // Byte mode
  appendBits(bits, bytes.length, 8); // Versions 1-9 use an 8-bit byte count
  for (const byte of bytes) appendBits(bits, byte, 8);

  const capacity = DATA_CODEWORDS * 8;
  appendBits(bits, 0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
  }
  for (let pad = 0; data.length < DATA_CODEWORDS; pad++) {
    data.push(pad % 2 === 0 ? 0xec : 0x11);
  }
  return data;
}

function createInterleavedCodewords(data: number[]): number[] {
  const blockDataLength = DATA_CODEWORDS / BLOCK_COUNT;
  const blocks = Array.from({ length: BLOCK_COUNT }, (_, i) =>
    data.slice(i * blockDataLength, (i + 1) * blockDataLength),
  );
  const ecc = blocks.map(block => reedSolomonRemainder(block, ECC_CODEWORDS_PER_BLOCK));
  const result: number[] = [];
  for (let i = 0; i < blockDataLength; i++) {
    for (const block of blocks) result.push(block[i]);
  }
  for (let i = 0; i < ECC_CODEWORDS_PER_BLOCK; i++) {
    for (const block of ecc) result.push(block[i]);
  }
  return result;
}

function formatInformation(mask: number): number {
  const data = mask;
  let remainder = data << 10;
  for (let bit = 14; bit >= 10; bit--) {
    if (((remainder >>> bit) & 1) !== 0) remainder ^= 0x537 << (bit - 10);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

export function createTicketQrMatrix(payload: string): number[][] {
  const codewords = createInterleavedCodewords(createDataCodewords(payload));
  const modules = Array.from({ length: SIZE }, () => new Array<number>(SIZE).fill(0));
  const functionModules = Array.from({ length: SIZE }, () => new Array<boolean>(SIZE).fill(false));

  const setFunction = (row: number, col: number, dark: boolean) => {
    if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return;
    modules[row][col] = dark ? 1 : 0;
    functionModules[row][col] = true;
  };

  const drawFinder = (centerRow: number, centerCol: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const row = centerRow + dy;
        const col = centerCol + dx;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(row, col, distance !== 2 && distance !== 4);
      }
    }
  };

  drawFinder(3, 3);
  drawFinder(3, SIZE - 4);
  drawFinder(SIZE - 4, 3);

  for (let i = 8; i < SIZE - 8; i++) {
    const dark = i % 2 === 0;
    setFunction(6, i, dark);
    setFunction(i, 6, dark);
  }

  for (const row of ALIGNMENT_CENTERS) {
    for (const col of ALIGNMENT_CENTERS) {
      if ((row === 6 && col === 6) || (row === 6 && col === SIZE - 7) || (row === SIZE - 7 && col === 6)) {
        continue;
      }
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunction(row + dy, col + dx, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve format-information modules before placing codeword bits.
  for (let i = 0; i <= 5; i++) setFunction(8, i, false);
  setFunction(8, 7, false);
  setFunction(8, 8, false);
  setFunction(7, 8, false);
  for (let i = 9; i < 15; i++) setFunction(14 - i, 8, false);
  for (let i = 0; i < 8; i++) setFunction(8, SIZE - 1 - i, false);
  for (let i = 8; i < 15; i++) setFunction(SIZE - 15 + i, 8, false);
  setFunction(SIZE - 8, 8, true);

  let bitIndex = 0;
  let upward = true;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < SIZE; vert++) {
      const row = upward ? SIZE - 1 - vert : vert;
      for (let offset = 0; offset < 2; offset++) {
        const col = right - offset;
        if (functionModules[row][col]) continue;
        const codeword = codewords[Math.floor(bitIndex / 8)] ?? 0;
        const bit = bitIndex < codewords.length * 8
          ? (codeword >>> (7 - (bitIndex % 8))) & 1
          : 0;
        const masked = ((row + col) % 2) === 0;
        modules[row][col] = bit ^ Number(masked);
        bitIndex++;
      }
    }
    upward = !upward;
  }

  const format = formatInformation(MASK_PATTERN);
  const formatBit = (index: number) => ((format >>> index) & 1) !== 0;
  for (let i = 0; i <= 5; i++) modules[8][i] = Number(formatBit(i));
  modules[8][7] = Number(formatBit(6));
  modules[8][8] = Number(formatBit(7));
  modules[7][8] = Number(formatBit(8));
  for (let i = 9; i < 15; i++) modules[14 - i][8] = Number(formatBit(i));
  for (let i = 0; i < 8; i++) modules[8][SIZE - 1 - i] = Number(formatBit(i));
  for (let i = 8; i < 15; i++) modules[SIZE - 15 + i][8] = Number(formatBit(i));
  modules[SIZE - 8][8] = 1;

  return modules;
}

export interface QrSvgRenderOptions {
  fgColor?: string;
  bgColor?: string;
  moduleSize?: number;
  quietZone?: number;
}

export function generateCustomQrSvg(
  payload: string,
  options?: QrSvgRenderOptions,
): string {
  const safePayload = payload.slice(0, 62);
  const matrix = createTicketQrMatrix(safePayload);
  const size = matrix.length;
  const moduleSize = options?.moduleSize ?? 8;
  const quietZone = options?.quietZone ?? 4;
  const padding = quietZone * moduleSize;
  const totalSize = size * moduleSize + padding * 2;
  const fg = options?.fgColor ?? '#0f172a';
  const bg = options?.bgColor ?? '#ffffff';

  let pathD = '';
  for (let r = 0; r < size; r++) {
    const y = padding + r * moduleSize;
    let c = 0;
    while (c < size) {
      if (matrix[r][c] === 1) {
        const startC = c;
        c++;
        while (c < size && matrix[r][c] === 1) c++;
        pathD += `M${padding + startC * moduleSize} ${y}h${(c - startC) * moduleSize}v${moduleSize}h-${(c - startC) * moduleSize}z`;
      } else {
        c++;
      }
    }
  }

  const escapeXml = (value: string) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

  const rx = Math.round(moduleSize * 1.5);
  const bgRect = bg !== 'transparent' ? `<rect width="${totalSize}" height="${totalSize}" rx="${rx}" ry="${rx}" fill="${escapeXml(bg)}"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}" role="img" aria-label="Ticket QR code"><desc>${escapeXml(safePayload)}</desc>${bgRect}<path fill="${escapeXml(fg)}" d="${pathD}"/></svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
