import { pathToFileURL } from 'node:url';

// Pure validation: no connections, credentials in output, or provider requests.
export function productionConfigErrors(env) {
  const errors = [];
  const staging = env.TICKET_DEPLOY_ENV === 'staging';
  if (env.TICKET_DEPLOY_ENV && !['production', 'staging'].includes(env.TICKET_DEPLOY_ENV)) {
    errors.push('TICKET_DEPLOY_ENV must be production or staging');
  }
  const requireValue = (name) => {
    if (!env[name]?.trim()) errors.push(`${name} is required`);
  };
  for (const name of ['DATABASE_URL', 'BETTER_AUTH_URL', 'BETTER_AUTH_SECRET',
    'RESEND_API_KEY', 'EMAIL_FROM', 'STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) requireValue(name);
  try {
    const url = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error();
  } catch { errors.push('DATABASE_URL must address a production PostgreSQL host'); }
  try {
    const url = new URL(env.BETTER_AUTH_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
  } catch { errors.push('BETTER_AUTH_URL must be an HTTPS origin'); }
  if ((env.BETTER_AUTH_SECRET?.length || 0) < 32) errors.push('BETTER_AUTH_SECRET must have at least 32 characters');
  if (!env.RESEND_API_KEY?.startsWith('re_')) errors.push('RESEND_API_KEY must be a Resend API key');
  if (!/^[^\r\n]*@[^\s<>]+\.[^\s<>]+>?$/.test(env.EMAIL_FROM || '') ||
    /\.(invalid|local|example|test)>?$/i.test(env.EMAIL_FROM || '')) errors.push('EMAIL_FROM must use a verified public email domain');
  const stripeMode = staging ? 'test' : 'live';
  if (!['sk', 'rk'].some(prefix => env.STRIPE_SECRET_KEY?.startsWith(`${prefix}_${stripeMode}_`))) errors.push(`STRIPE_SECRET_KEY must be ${staging ? 'Test' : 'Live'} mode`);
  if (!env.STRIPE_PUBLISHABLE_KEY?.startsWith(`pk_${stripeMode}_`)) errors.push(`STRIPE_PUBLISHABLE_KEY must be ${staging ? 'Test' : 'Live'} mode`);
  if (staging && env.STRIPE_LIVE_MODE === 'true') errors.push('STRIPE_LIVE_MODE must not be true in staging');
  if (!staging && env.ENABLE_PAY_TEST === 'true') errors.push('ENABLE_PAY_TEST must not be true in production');
  if (!staging && env.ENABLE_DEV_MAIL_PREVIEW === 'true') errors.push('ENABLE_DEV_MAIL_PREVIEW must not be true in production');
  if (!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_') || env.STRIPE_WEBHOOK_SECRET === 'whsec_test_secret') errors.push('STRIPE_WEBHOOK_SECRET must be the production endpoint signing secret');
  try {
    const url = new URL(env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
    if ((!env.R2_ENDPOINT && !env.R2_ACCOUNT_ID) || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
  } catch { errors.push('Set R2_ACCOUNT_ID or a valid HTTPS R2_ENDPOINT'); }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = productionConfigErrors(process.env);
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else console.log('Production configuration shape passed; provider readiness is not verified');
}
