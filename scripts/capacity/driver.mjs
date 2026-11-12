import assert from 'node:assert/strict';
const target = new URL(process.env.CAPACITY_TARGET || '');
if (target.protocol !== 'http:' || !/^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\.|^127\./.test(target.hostname)) {
  throw new Error('Driver accepts only a private IPv4 test target');
}
const base = target.origin;
let serial = 0;
const summaries = [];
const time = () => performance.now();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const quantiles = samples => {
  if (!samples.length) return { count: 0 };
  const s = [...samples].sort((a, b) => a - b);
  return { count: s.length, p50_ms: Math.round(s[Math.floor(s.length * .5)]), p95_ms: Math.round(s[Math.min(s.length - 1, Math.floor(s.length * .95))]), max_ms: Math.round(s.at(-1)) };
};
async function call(path, { data, cookie, ip = '10.254.0.1', token, allowError = false, stats } = {}) {
  const start = time();
  const response = await fetch(base + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', host: 'localhost:3000', origin: 'http://localhost:3000',
      'x-forwarded-for': ip, ...(cookie ? { cookie } : {}), ...(token ? { 'x-guest-token': token } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  const key = path.split('?')[0].replace(/ORD-[^/?]+/g, ':order').replace(/\/events\/[^/?]+/g, '/events/:event');
  if (stats) (stats[key] ||= []).push(time() - start);
  if (!response.ok && !allowError) throw new Error(`HTTP ${response.status} at ${key}: ${body.code || body.message || ''}`);
  return { body, status: response.status, cookie: response.headers.getSetCookie().map(v => v.split(';')[0]).join('; ') };
}
for (let i = 0; i < 120; i++) {
  try { if ((await fetch(base + '/api/health', { signal: AbortSignal.timeout(2000) })).ok) break; } catch {}
  if (i === 119) throw new Error('Capacity app did not become healthy');
  await wait(1000);
}
async function login(email) {
  return (await call('/api/auth/sign-in/email', { data: { email, password: 'Capacity-only-fixture!20261112' } })).cookie;
}
const organizer = await login('organizer@capacity.invalid');
const owner = await login('owner@capacity.invalid');
async function makeEvent(quota, label) {
  const { body } = await call('/api/events', { cookie: organizer, data: {
    title: `Capacity ${label}`, location: 'Isolated test database', limitPerOrder: 4,
    sessions: [{ startTime: new Date(Date.now() + 30 * 86400000).toISOString(), endTime: new Date(Date.now() + 30 * 86400000 + 7200000).toISOString(),
      ticketTypes: [{ name: 'Capacity admission', price: 150, quota }] }],
  } });
  const event = body.event, session = event.sessions[0];
  await call(`/api/events/${event.id}?action=submit-session`, { cookie: organizer, data: { sessionId: session.id } });
  await call('/api/owner/sessions', { cookie: owner, data: { sessionId: session.id, action: 'approve' } });
  return { eventId: event.id, sessionId: session.id, ticketTypeId: session.ticketTypes[0].id };
}
async function buyer(event, { stats, expectSoldOut = false } = {}) {
  const i = ++serial, start = time();
  const ip = `10.253.${Math.floor(i / 250) % 250}.${i % 250 + 1}`;
  const buyer = { name: `Capacity buyer ${i}`, email: `capacity-${i}@capacity.invalid`, phone: `08${String(i).padStart(8, '0')}` };
  let queueToken, queueWaitStart = time();
  for (;;) {
    const { body: queue } = await call(`/api/events/${event.eventId}/queue/status${queueToken ? `?token=${encodeURIComponent(queueToken)}` : ''}`, { ip, stats });
    queueToken = queue.token;
    if (queue.allowed) break;
    if (time() - queueWaitStart > 30000) throw new Error('Queue wait exceeded 30 seconds');
    await wait(250);
  }
  const { body: otp } = await call('/api/public/checkout/request-otp', { ip, stats, data: { buyer, eventId: event.eventId, purpose: 'checkout', requestedQuantity: 1, queueToken } });
  assert.match(otp.devOtpCode, /^\d{6}$/);
  const { body: verified } = await call('/api/public/checkout/verify-otp', { ip, stats, data: { buyer, email: buyer.email, code: otp.devOtpCode, requestId: otp.requestId, purpose: 'checkout', eventId: event.eventId, queueToken } });
  const token = verified.verifiedToken; assert.ok(token);
  const reserved = await call('/api/public/checkout/reserve', { ip, stats, allowError: expectSoldOut, data: {
    verifiedToken: token, eventId: event.eventId, sessionId: event.sessionId, items: [{ ticketTypeId: event.ticketTypeId, quantity: 1 }], queueToken,
  } });
  if (expectSoldOut) { assert.equal(reserved.status, 400); assert.match(reserved.body.message, /เหลือไม่เพียงพอ/); return; }
  const orderId = reserved.body.reservation.id;
  const { body: qr } = await call(`/api/public/checkout/orders/${orderId}/payment-qr`, { ip, token, stats, data: { verifiedToken: token } });
  assert.equal(qr.charge.livemode, false);
  const { body: paid } = await call(`/api/public/checkout/orders/${orderId}/pay-test`, { ip, token, stats, data: { verifiedToken: token } });
  assert.equal(paid.status, 'paid');
  const { body: issued } = await call(`/api/public/checkout/orders/${orderId}/tickets`, { ip, token, stats });
  assert.equal(issued.tickets.length, 1);
  return { orderId, code: issued.tickets[0].ticketCode, qr: issued.tickets[0].qrPayload, ms: time() - start };
}
const warmup = await makeEvent(1, 'warmup'); await buyer(warmup); await buyer(warmup, { expectSoldOut: true });
console.log('CAPACITY_SMOKE ' + JSON.stringify({ paid: 1, soldOutRejected: true, providers: 'doubles' }));
async function stage(concurrency) {
  const count = Math.max(100, concurrency * 3), event = await makeEvent(count, `c${concurrency}-${summaries.length}`);
  const stats = {}, successes = [], failures = [];
  let next = 0, active = 0, peak = 0;
  const start = time();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < count && failures.length < Math.max(3, Math.ceil(count * .01))) {
      const index = next++; active++; peak = Math.max(peak, active);
      try { successes.push(await buyer(event, { stats })); }
      catch (error) { failures.push({ index, error: String(error.message).slice(0, 240) }); }
      finally { active--; }
    }
  }));
  const elapsed = (time() - start) / 1000, journey = quantiles(successes.map(r => r.ms));
  const uniqueCodes = new Set(successes.map(r => r.code)).size === successes.length;
  const uniqueQrs = new Set(successes.map(r => r.qr)).size === successes.length;
  let soldOutRejected = false;
  if (successes.length === count) { await buyer(event, { expectSoldOut: true }); soldOutRejected = true; }
  const passed = failures.length === 0 && successes.length === count && journey.p95_ms <= 5000 && uniqueCodes && uniqueQrs && soldOutRejected;
  const result = { concurrency, peak_active_journeys: peak, planned_orders: count, successful_orders: successes.length, failures,
    elapsed_s: Number(elapsed.toFixed(2)), orders_per_s: Number((successes.length / elapsed).toFixed(2)), journey,
    uniqueCodes, uniqueQrs, soldOutRejected, passed, endpoints: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k.split('?')[0], quantiles(v)])) };
  summaries.push(result); console.log('CAPACITY_STAGE ' + JSON.stringify(result)); return passed;
}
let lastPass = 0, firstFail = null;
for (const concurrency of [10, 20, 40, 80, 120, 160, 200, 300, 400]) {
  if (await stage(concurrency)) lastPass = concurrency;
  else { firstFail = concurrency; break; }
}
if (firstFail !== null && lastPass > 0) {
  let low = lastPass, high = firstFail;
  for (let i = 0; i < 2 && high - low > 5; i++) {
    const midpoint = Math.floor((low + high) / 10) * 5;
    if (midpoint <= low) break;
    if (await stage(midpoint)) low = midpoint; else high = midpoint;
  }
  lastPass = low; firstFail = high;
}
console.log('CAPACITY_RESULT ' + JSON.stringify({ providers: 'doubles', environment: 'isolated AWS Fargate + staging Neon, fresh database',
  slo: 'p95 complete server journey <=5000 ms and zero unexpected errors; no human OTP/banking delay',
  lastPassingConcurrency: lastPass, firstFailingConcurrency: firstFail, reachedConfiguredCeiling: firstFail === null,
  stages: summaries.map(({ endpoints, ...r }) => r) }));
