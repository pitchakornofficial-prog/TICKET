import sharp from 'sharp';
import { MAX_FILE_SIZE } from './upload-quota.ts';

/** Decode and re-encode public raster images so uploaded metadata and trailing payloads are discarded. */
export async function sanitizePublicImage(buffer: Buffer, contentType: string): Promise<Buffer> {
  const options = { failOn: 'warning' as const, limitInputPixels: 40_000_000 };
  let pipeline = sharp(buffer, options).rotate();

  switch (contentType) {
    case 'image/jpeg':
      pipeline = pipeline.jpeg({ mozjpeg: true });
      break;
    case 'image/png':
      pipeline = pipeline.png({ compressionLevel: 8 });
      break;
    case 'image/webp':
      pipeline = pipeline.webp({ quality: 80 });
      break;
    default:
      throw new Error('Unsupported public image format');
  }

  const sanitized = await pipeline.toBuffer();
  if (sanitized.byteLength === 0 || sanitized.byteLength > MAX_FILE_SIZE) {
    throw new Error('Sanitized image exceeds the upload size limit');
  }
  return sanitized;
}
