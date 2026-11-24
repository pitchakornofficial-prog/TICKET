import sharp from 'sharp';
import { generateCustomQrSvg } from '../lib/ticket-qr.ts';

/**
 * Generates a crisp opaque PNG buffer (pure white #ffffff background, pure black #000000 modules)
 * for a ticket QR payload using sharp. Safe against dark-mode color inversion.
 */
export async function generateTicketQrPngBuffer(
  qrPayload: string,
  options?: { size?: number },
): Promise<Buffer> {
  const size = options?.size || 400;
  const svgDataUrl = generateCustomQrSvg(qrPayload, {
    fgColor: '#000000',
    bgColor: '#ffffff',
    moduleSize: 8,
    quietZone: 4,
  });

  const svgXml = decodeURIComponent(
    svgDataUrl.replace(/^data:image\/svg\+xml;?(utf8|charset=utf-8)?,/i, ''),
  );

  return sharp(Buffer.from(svgXml))
    .resize(size, size, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();
}
