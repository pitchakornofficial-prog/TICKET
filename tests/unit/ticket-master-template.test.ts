import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_STATE,
  MASTER_TEMPLATE_STORAGE_KEY,
  EVENT_MASTER_TEMPLATE_CHANGED,
  CHANNEL_MASTER_TEMPLATE,
  loadLocalMasterTemplate,
  saveLocalMasterTemplate,
} from '../../src/lib/ticket-master-template-sync';
import { parseTicketMasterTemplate } from '../../src/server/ticket-master-template';
import { generateTicketCanvas } from '../../src/components/ticket-canvas-download';
import type { TicketDetail } from '../../src/server/tickets';

class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string) {
    return this.store[key] || null;
  }
  setItem(key: string, value: string) {
    this.store[key] = value;
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

describe('Master Ticket Template System (D-275)', () => {
  const rootDir = process.cwd();
  const originalLocalStorage = globalThis.localStorage;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    (globalThis as unknown as { localStorage: unknown }).localStorage = mockStorage;
    (globalThis as unknown as { window: unknown }).window = {
      dispatchEvent: () => true,
      localStorage: mockStorage,
    };
  });

  afterEach(() => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = originalLocalStorage;
    (globalThis as unknown as { window: unknown }).window = originalWindow;
    (globalThis as unknown as { document: unknown }).document = originalDocument;
  });

  const mockTicket: TicketDetail = {
    id: 'tkt-test-01',
    orderId: 'ORD-20261224-8891',
    orderItemId: 'item-01',
    eventId: 'evt-rock-2026',
    sessionId: 'session-01',
    ticketTypeId: 'type-vip',
    ticketTypeName: 'VIP FRONT ROW - ZONE A',
    ticketPrice: 3500,
    ticketCode: 'TK-849201-9482-01',
    qrPayload: 'TK-849201-9482-01',
    qrCodeUrl: 'data:image/svg+xml;utf8,<svg></svg>',
    status: 'valid',
    admissionStatus: 'outside',
    buyerName: 'Somchai Rakdontri',
    buyerEmail: 'somchai@test.com',
    buyerPhone: '0812345678',
    sessionStartTime: '2026-12-24T18:00:00.000Z',
    sessionEndTime: '2026-12-24T23:30:00.000Z',
    location: 'Chiang Mai Exhibition Hall 1',
    eventTitle: 'Isan Indy Rock Fest 2026',
    createdAt: '2026-11-20T00:00:00.000Z',
  };

  it('validates DEFAULT_STATE schema and master storage key', () => {
    expect(MASTER_TEMPLATE_STORAGE_KEY).toBe('ticket_master_template_v1');
    expect(EVENT_MASTER_TEMPLATE_CHANGED).toBe('ticket_master_template_updated');
    expect(CHANNEL_MASTER_TEMPLATE).toBe('ticket_master_template_channel');

    expect(DEFAULT_STATE.presetId).toBe('classic-white');
    expect(DEFAULT_STATE.fontFamily).toBe('Kanit');
    expect(DEFAULT_STATE.elements.eventTitle).toBeDefined();
    expect(DEFAULT_STATE.elements.zoneBadge).toBeDefined();
    expect(DEFAULT_STATE.elements.dateTime).toBeDefined();
    expect(DEFAULT_STATE.elements.venue).toBeDefined();
    expect(DEFAULT_STATE.elements.buyerName).toBeDefined();
    expect(DEFAULT_STATE.elements.ticketCode).toBeDefined();
    expect(DEFAULT_STATE.elements.orderId).toBeDefined();
    expect(DEFAULT_STATE.elements.qrCode).toBeDefined();
  });

  it('verifies parseTicketMasterTemplate parses valid state and rejects invalid input', () => {
    expect(parseTicketMasterTemplate(null)).toBeNull();
    expect(parseTicketMasterTemplate('invalid')).toBeNull();
    expect(parseTicketMasterTemplate([])).toBeNull();
    expect(parseTicketMasterTemplate({ presetId: 123 })).toBeNull();
    expect(parseTicketMasterTemplate({ presetId: 'test', elements: 'not-an-object' })).toBeNull();

    const parsed = parseTicketMasterTemplate({
      presetId: 'custom-preset',
      elements: {
        eventTitle: { id: 'eventTitle', visible: true, x: 50, y: 50 },
      },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.presetId).toBe('custom-preset');
  });

  it('verifies local storage load and save triggers window and broadcast events', () => {
    let dispatched = false;
    (globalThis as unknown as { window: unknown }).window = {
      dispatchEvent: () => {
        dispatched = true;
        return true;
      },
      localStorage: mockStorage,
    };

    const customState = {
      ...DEFAULT_STATE,
      presetId: 'matte-black',
      bgColor: '#0f172a',
    };

    saveLocalMasterTemplate(customState);
    expect(dispatched).toBe(true);
    expect(mockStorage.getItem(MASTER_TEMPLATE_STORAGE_KEY)).toContain('matte-black');

    const loaded = loadLocalMasterTemplate();
    expect(loaded.presetId).toBe('matte-black');
    expect(loaded.bgColor).toBe('#0f172a');
  });

  it('renders canvas pass with master template styling and ticket data when canvas is available', async () => {
    const mockCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: '',
      textBaseline: '',
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fillText: () => {},
      measureText: () => ({ width: 100 }),
      save: () => {},
      restore: () => {},
      setLineDash: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      drawImage: () => {},
    };

    const mockCanvas = {
      width: 1200,
      height: 500,
      getContext: () => mockCtx,
      toDataURL: () => 'data:image/png;base64,mock',
    };

    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') return mockCanvas;
        return {};
      },
    };

    const customTemplate = {
      ...DEFAULT_STATE,
      presetId: 'vip-gold-pass',
      bgColor: '#fef3c7',
      borderColor: '#d97706',
      borderWidth: 2,
    };

    const canvas = await generateTicketCanvas(mockTicket, customTemplate);
    expect(canvas).toBeDefined();
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(500);
  });

  it('verifies ticket designer save button and customer views integration', () => {
    const designerSrc = readFileSync(
      join(rootDir, 'src/components/admin-ticket-designer.tsx'),
      'utf8',
    );
    const lookupSrc = readFileSync(
      join(rootDir, 'src/components/guest-order-lookup-view.tsx'),
      'utf8',
    );
    const successSrc = readFileSync(
      join(rootDir, 'src/components/order-success-view.tsx'),
      'utf8',
    );

    // Designer saves to DB and broadcasts
    expect(designerSrc).toContain('/api/owner/ticket-master-template');
    expect(designerSrc).toContain('ticket_master_template_updated');
    expect(designerSrc).toContain('ticket_master_template_channel');

    // Customer views listen for updates and re-generate ticket passes
    expect(lookupSrc).toContain('/api/public/ticket-master-template');
    expect(lookupSrc).toContain('ticket_master_template_updated');
    expect(lookupSrc).toContain('setTicketImageUrls');

    expect(successSrc).toContain('/api/public/ticket-master-template');
    expect(successSrc).toContain('ticket_master_template_updated');
    expect(successSrc).toContain('setTicketImageUrls');
  });

  it('verifies zero emojis across all ticket master template files (D-14)', () => {
    const emojiRegex = /\p{Extended_Pictographic}/u;

    const files = [
      'src/lib/ticket-master-template-sync.ts',
      'src/server/ticket-master-template.ts',
      'src/app/api/owner/ticket-master-template/route.ts',
      'src/app/api/public/ticket-master-template/route.ts',
      'src/components/ticket-canvas-download.ts',
    ];

    for (const f of files) {
      const content = readFileSync(join(rootDir, f), 'utf8');
      expect(emojiRegex.test(content)).toBe(false);
    }
  });

  it('uploads designer background images via /api/upload instead of Base64 FileReader and expands API limit to 1MB', () => {
    const designerSrc = readFileSync(
      join(rootDir, 'src/components/admin-ticket-designer.tsx'),
      'utf8',
    );
    const ownerRouteSrc = readFileSync(
      join(rootDir, 'src/app/api/owner/ticket-master-template/route.ts'),
      'utf8',
    );

    expect(designerSrc).toContain("fetch('/api/upload'");
    expect(designerSrc).not.toContain('readAsDataURL');
    expect(designerSrc).toContain('if (!res.ok)');
    expect(ownerRouteSrc).toContain('1024 * 1024');
  });

  it('falls back to ticket.ticketTemplateUrl or ticket.eventPosterUrl on blank default or broken image background', async () => {
    const drawnSources: string[] = [];
    const mockCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: '',
      textBaseline: '',
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fillText: () => {},
      measureText: () => ({ width: 100 }),
      save: () => {},
      restore: () => {},
      setLineDash: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      drawImage: (img: { src?: string }) => {
        if (img?.src) drawnSources.push(img.src);
      },
    };

    const mockCanvas = {
      width: 1200,
      height: 500,
      getContext: () => mockCtx,
      toDataURL: () => 'data:image/png;base64,mock',
    };

    const origImage = globalThis.Image;
    class MockImage {
      crossOrigin = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = '';
      get src() {
        return this._src;
      }
      set src(val: string) {
        this._src = val;
        queueMicrotask(() => {
          if (val.includes('broken')) {
            this.onerror?.();
          } else {
            this.onload?.();
          }
        });
      }
    }

    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => (tag === 'canvas' ? mockCanvas : {}),
    };
    (globalThis as unknown as { Image: unknown }).Image = MockImage;

    try {
      const ticketWithPoster = {
        ...mockTicket,
        ticketTemplateUrl: null,
        eventPosterUrl: '/api/media/posters%2Ffallback-poster.jpg',
      };

      // 1. Default blank classic-white template falls back to concert poster
      await generateTicketCanvas(ticketWithPoster, { ...DEFAULT_STATE });
      expect(drawnSources).toContain('/api/media/posters%2Ffallback-poster.jpg');

      // 2. Broken custom image template falls back to ticketTemplateUrl / eventPosterUrl
      drawnSources.length = 0;
      await generateTicketCanvas(
        { ...ticketWithPoster, ticketTemplateUrl: '/api/media/posters%2Fevent-ticket-bg.png' },
        { ...DEFAULT_STATE, bgType: 'image', bgImageUrl: '/api/media/posters%2Fbroken.png' },
      );
      expect(drawnSources).toContain('/api/media/posters%2Fevent-ticket-bg.png');
    } finally {
      (globalThis as unknown as { Image: unknown }).Image = origImage;
    }
  });
});
