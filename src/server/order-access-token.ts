import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_PREFIX = 'ordtok_';

function resolveOrderLinkSecret(): string {
  const configured =
    process.env.BETTER_AUTH_SECRET?.trim() || process.env.TICKET_ORDER_LINK_SECRET?.trim();
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_SECRET is required to sign order ticket access links');
  }
  return 'ticket-local-dev-order-link-secret';
}

function normalizeBuyerPhone(phone: string): string {
  return phone.trim().replace(/[\s-]/g, '');
}

function computeSignature(orderId: string, buyerEmail: string, buyerPhone: string): string {
  const secret = resolveOrderLinkSecret();
  const payload = `order-ticket-access:${orderId.trim()}:${buyerEmail.trim().toLowerCase()}:${normalizeBuyerPhone(buyerPhone)}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Generates an HMAC-SHA256 signed order-link challenge token bound to an order ID and buyer email/phone.
 * The token authorizes initiating an email OTP verification step for that order without re-entering
 * email/phone, and never bypasses OTP verification to read order details or tickets (AC-63, G-17).
 */
export function createOrderTicketAccessToken(orderId: string, buyerEmail: string, buyerPhone: string): string {
  return `${TOKEN_PREFIX}${computeSignature(orderId, buyerEmail, buyerPhone)}`;
}

export function extractOrderRequestToken(request: Request): string {
  const url = new URL(request.url);
  return (
    request.headers.get('x-guest-token') ||
    request.headers.get('x-guest-session') ||
    request.headers.get('x-order-token') ||
    url.searchParams.get('token') ||
    url.searchParams.get('verifiedToken') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  );
}

export function isOrderTicketAccessToken(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX);
}

export function verifyOrderTicketAccessToken(
  token: string,
  orderId: string,
  buyerEmail: string,
  buyerPhone: string,
): boolean {
  if (!isOrderTicketAccessToken(token) || !orderId || !buyerEmail || !buyerPhone) {
    return false;
  }
  const providedSig = token.slice(TOKEN_PREFIX.length);
  const expectedSig = computeSignature(orderId, buyerEmail, buyerPhone);
  const providedBuf = Buffer.from(providedSig, 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  if (providedBuf.length === 0 || providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

export async function resolveAuthorizedOrderReservation<
  T extends { buyerEmail: string; buyerPhone: string; status: string },
>(options: {
  orderId: string;
  token: string;
  unauthorizedMessage: string;
  forbiddenMessage: string;
  getOrderReservation: (orderId: string) => Promise<T | null>;
  getVerifiedGuestSession: (token: string) => Promise<{ email: string; phone: string; purpose: string } | null>;
}): Promise<
  | { ok: true; reservation: T }
  | { ok: false; response: Response }
> {
  const { orderId, token, unauthorizedMessage, forbiddenMessage } = options;

  if (!token || isOrderTicketAccessToken(token)) {
    return {
      ok: false,
      response: Response.json({ message: unauthorizedMessage }, { status: 401 }),
    };
  }

  const verifiedSession = await options.getVerifiedGuestSession(token);
  if (!verifiedSession) {
    return {
      ok: false,
      response: Response.json(
        { message: 'Session ยืนยันตัวตนไม่ถูกต้องหรือหมดอายุแล้ว กรุณายืนยัน OTP ใหม่' },
        { status: 401 },
      ),
    };
  }

  const reservation = await options.getOrderReservation(orderId);
  if (!reservation) {
    return {
      ok: false,
      response: Response.json({ message: 'ไม่พบรายการคำสั่งซื้อ' }, { status: 404 }),
    };
  }

  const sessionBoundOrderId = verifiedSession.purpose.startsWith('order_lookup:')
    ? verifiedSession.purpose.slice('order_lookup:'.length)
    : null;
  const normalizedPhone = (value: string) => value.trim().replace(/[\s-]/g, '');
  if (
    reservation.buyerEmail.trim().toLowerCase() !== verifiedSession.email.trim().toLowerCase()
    || normalizedPhone(reservation.buyerPhone) !== normalizedPhone(verifiedSession.phone)
    || (sessionBoundOrderId !== null && sessionBoundOrderId !== orderId)
  ) {
    return {
      ok: false,
      response: Response.json({ message: forbiddenMessage }, { status: 403 }),
    };
  }

  return { ok: true, reservation };
}
