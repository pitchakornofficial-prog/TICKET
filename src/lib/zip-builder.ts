/**
 * Pure TypeScript ZIP builder implementing the standard PKZIP format (Store mode - method 0).
 * Zero external dependencies. Browser & Node.js compatible.
 */

// Precomputed CRC32 lookup table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

export function computeCrc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export interface ZipFileInput {
  name: string;
  data: Uint8Array | string;
  date?: Date;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day,
  };
}

export function buildZipBlob(files: ZipFileInput[]): Blob {
  const encoder = new TextEncoder();
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let currentOffset = 0;

  for (const file of files) {
    const rawData = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const nameBytes = encoder.encode(file.name);
    const crc = computeCrc32(rawData);
    const size = rawData.length;
    const { time, date } = dosDateTime(file.date || new Date());

    // 1. Local File Header (30 bytes + name length + data length)
    const localBuf = new Uint8Array(30 + nameBytes.length + size);
    const localView = new DataView(localBuf.buffer);

    localView.setUint32(0, 0x04034B50, true); // signature
    localView.setUint16(4, 20, true);         // version needed (2.0)
    localView.setUint16(6, 0x0800, true);     // flags (bit 11 = UTF-8)
    localView.setUint16(8, 0, true);          // compression method 0 (Store)
    localView.setUint16(10, time, true);      // mod time
    localView.setUint16(12, date, true);      // mod date
    localView.setUint32(14, crc, true);       // crc-32
    localView.setUint32(18, size, true);      // compressed size
    localView.setUint32(22, size, true);      // uncompressed size
    localView.setUint16(26, nameBytes.length, true); // filename length
    localView.setUint16(28, 0, true);         // extra field length

    localBuf.set(nameBytes, 30);
    localBuf.set(rawData, 30 + nameBytes.length);

    localHeaders.push(localBuf);

    // 2. Central Directory Header (46 bytes + name length)
    const centralBuf = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralBuf.buffer);

    centralView.setUint32(0, 0x02014B50, true); // signature
    centralView.setUint16(4, 20, true);         // version made by
    centralView.setUint16(6, 20, true);         // version needed
    centralView.setUint16(8, 0x0800, true);     // flags (bit 11 = UTF-8)
    centralView.setUint16(10, 0, true);         // compression method 0
    centralView.setUint16(12, time, true);      // mod time
    centralView.setUint16(14, date, true);      // mod date
    centralView.setUint32(16, crc, true);       // crc-32
    centralView.setUint32(20, size, true);      // compressed size
    centralView.setUint32(24, size, true);      // uncompressed size
    centralView.setUint16(28, nameBytes.length, true); // filename length
    centralView.setUint16(30, 0, true);         // extra field length
    centralView.setUint16(32, 0, true);         // comment length
    centralView.setUint16(34, 0, true);         // disk start
    centralView.setUint16(36, 0, true);         // internal attrs
    centralView.setUint32(38, 0, true);         // external attrs
    centralView.setUint32(42, currentOffset, true); // relative offset of local header

    centralBuf.set(nameBytes, 46);
    centralHeaders.push(centralBuf);

    currentOffset += localBuf.length;
  }

  const centralDirectoryOffset = currentOffset;
  let centralDirectorySize = 0;
  for (const ch of centralHeaders) {
    centralDirectorySize += ch.length;
  }

  // 3. End of Central Directory Record (22 bytes)
  const eocdBuf = new Uint8Array(22);
  const eocdView = new DataView(eocdBuf.buffer);

  eocdView.setUint32(0, 0x06054B50, true); // signature
  eocdView.setUint16(4, 0, true);          // disk number
  eocdView.setUint16(6, 0, true);          // start disk
  eocdView.setUint16(8, files.length, true);  // entries on this disk
  eocdView.setUint16(10, files.length, true); // total entries
  eocdView.setUint32(12, centralDirectorySize, true); // central directory size
  eocdView.setUint32(16, centralDirectoryOffset, true); // offset of central directory
  eocdView.setUint16(20, 0, true);         // comment length

  // Combine into single Blob
  const allParts: (Uint8Array | Blob)[] = [...localHeaders, ...centralHeaders, eocdBuf];
  return new Blob(allParts as BlobPart[], { type: 'application/zip' });
}

export function buildZipUint8Array(files: ZipFileInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let currentOffset = 0;

  for (const file of files) {
    const rawData = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const nameBytes = encoder.encode(file.name);
    const crc = computeCrc32(rawData);
    const size = rawData.length;
    const { time, date } = dosDateTime(file.date || new Date());

    const localBuf = new Uint8Array(30 + nameBytes.length + size);
    const localView = new DataView(localBuf.buffer);

    localView.setUint32(0, 0x04034B50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);

    localBuf.set(nameBytes, 30);
    localBuf.set(rawData, 30 + nameBytes.length);

    localHeaders.push(localBuf);

    const centralBuf = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralBuf.buffer);

    centralView.setUint32(0, 0x02014B50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, currentOffset, true);

    centralBuf.set(nameBytes, 46);
    centralHeaders.push(centralBuf);

    currentOffset += localBuf.length;
  }

  const centralDirectoryOffset = currentOffset;
  let centralDirectorySize = 0;
  for (const ch of centralHeaders) {
    centralDirectorySize += ch.length;
  }

  const eocdBuf = new Uint8Array(22);
  const eocdView = new DataView(eocdBuf.buffer);

  eocdView.setUint32(0, 0x06054B50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, files.length, true);
  eocdView.setUint16(10, files.length, true);
  eocdView.setUint32(12, centralDirectorySize, true);
  eocdView.setUint32(16, centralDirectoryOffset, true);
  eocdView.setUint16(20, 0, true);

  const totalSize = currentOffset + centralDirectorySize + 22;
  const result = new Uint8Array(totalSize);

  let offset = 0;
  for (const lh of localHeaders) {
    result.set(lh, offset);
    offset += lh.length;
  }
  for (const ch of centralHeaders) {
    result.set(ch, offset);
    offset += ch.length;
  }
  result.set(eocdBuf, offset);

  return result;
}
