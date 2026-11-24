import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { generateTicketQrPngBuffer } from '../../src/server/ticket-qr-png';
import { generateTicketQrSvg } from '../../src/server/tickets';

describe('QR Code Solid White Background & Dark-Mode Safety', () => {
  const rootDir = process.cwd();

  it('flattens a transparent PromptPay SVG through sharp resize+flatten+extend into a 600x600 opaque PNG with white border', async () => {
    // Transparent SVG with NO white background rect (simulating live Stripe PromptPay SVG)
    const transparentSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <rect x="20" y="20" width="60" height="60" fill="#000000"/>
    </svg>`;

    const pngBuffer = await sharp(Buffer.from(transparentSvg))
      .resize(536, 536, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .extend({
        top: 32,
        bottom: 32,
        left: 32,
        right: 32,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer();

    const meta = await sharp(pngBuffer).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(600);
    expect(meta.hasAlpha).toBe(false);

    const { data, info } = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);

    // Top-left corner pixel (0, 0) must be pure white RGB (255, 255, 255)
    expect(data[0]).toBe(255);
    expect(data[1]).toBe(255);
    expect(data[2]).toBe(255);

    // Center pixel (300, 300) inside the black square must be pure black RGB (0, 0, 0)
    const centerIdx = (300 * info.width + 300) * info.channels;
    expect(data[centerIdx]).toBe(0);
    expect(data[centerIdx + 1]).toBe(0);
    expect(data[centerIdx + 2]).toBe(0);
  });

  it('generates opaque pure black-on-white ticket QR PNG buffer (no alpha transparency)', async () => {
    const pngBuffer = await generateTicketQrPngBuffer('TKT-DARKMODE-TEST-01', { size: 400 });

    const meta = await sharp(pngBuffer).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(400);
    expect(meta.hasAlpha).toBe(false);

    const { data, info } = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);

    // Top-left corner quiet zone pixel must be pure white (255, 255, 255)
    expect(data[0]).toBe(255);
    expect(data[1]).toBe(255);
    expect(data[2]).toBe(255);

    // Must contain pure black (0, 0, 0) QR module pixels
    let foundPureBlack = false;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) {
        foundPureBlack = true;
        break;
      }
    }
    expect(foundPureBlack).toBe(true);
  });

  it('uses pure black #000000 modules on #ffffff background in generateTicketQrSvg', () => {
    const svgUrl = generateTicketQrSvg('TK-123456-0001-01', 'PAYLOAD-DARK-TEST');
    const svg = decodeURIComponent(svgUrl);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
    expect(svg).not.toContain('<path fill="#0f172a"');
  });

  it('verifies payment QR download route uses sharp flatten and extend onto solid white', () => {
    const routeSrc = readFileSync(
      join(rootDir, 'src/app/api/public/checkout/orders/[id]/payment-qr/download/route.ts'),
      'utf8',
    );
    expect(routeSrc).toContain('.flatten(');
    expect(routeSrc).toContain('.extend(');
    expect(routeSrc).toContain('inline');
  });

  it('verifies ticket canvas renderer forces solid white #ffffff QR container and pure black #000000 QR modules', () => {
    const canvasSrc = readFileSync(
      join(rootDir, 'src/components/ticket-canvas-download.ts'),
      'utf8',
    );
    expect(canvasSrc).toContain("ctx.fillStyle = '#ffffff';");
    expect(canvasSrc).toContain("fgColor: '#000000'");
    expect(canvasSrc).toContain("bgColor: '#ffffff'");
  });
});
