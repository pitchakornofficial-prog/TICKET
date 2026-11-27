import sharp from 'sharp';
import { storage } from './storage';

const MAX_RENDERED_PNG_BYTES = 2 * 1024 * 1024;
const MAX_RENDERED_WIDTH = 1600;
const MAX_RENDERED_HEIGHT = 800;

export function getRenderedTicketImageKey(ticketId: string): string {
  const safeId = ticketId.replace(/[^a-zA-Z0-9_-]/g, '');
  return `rendered-tickets/${safeId}.png`;
}

export async function getStoredRenderedTicketImage(ticketId: string): Promise<Buffer | null> {
  if (!ticketId) return null;
  try {
    const item = await storage.get(getRenderedTicketImageKey(ticketId));
    return item?.data ?? null;
  } catch {
    return null;
  }
}

export async function validateAndStoreRenderedTicketImage(
  ticketId: string,
  dataUrl: string,
): Promise<Buffer> {
  if (!ticketId || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('Invalid PNG data URL');
  }

  const base64Payload = dataUrl.slice('data:image/png;base64,'.length);
  const rawBuffer = Buffer.from(base64Payload, 'base64');
  if (rawBuffer.length === 0 || rawBuffer.length > MAX_RENDERED_PNG_BYTES) {
    throw new Error('Rendered ticket image exceeds size limit');
  }

  const meta = await sharp(rawBuffer).metadata();
  if (
    meta.format !== 'png' ||
    !meta.width ||
    !meta.height ||
    meta.width > MAX_RENDERED_WIDTH ||
    meta.height > MAX_RENDERED_HEIGHT
  ) {
    throw new Error('Invalid PNG dimensions');
  }

  const cleanPng = await sharp(rawBuffer).png().toBuffer();
  await storage.put(getRenderedTicketImageKey(ticketId), cleanPng, 'image/png');
  return cleanPng;
}
