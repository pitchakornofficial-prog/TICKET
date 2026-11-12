// Test-image-only derivative. Never run this against the working tree or live image.
import { readFileSync, writeFileSync } from 'node:fs';
if (process.cwd() !== '/app') throw new Error('Capacity image preparation is container-only');
for (const [path, expected] of [
  ['src/server/guest-otp.ts', 2],
  ['src/server/email.ts', 1],
  ['src/app/api/public/checkout/orders/[id]/pay-test/route.ts', 1],
]) {
  const text = readFileSync(path, 'utf8');
  const count = text.split('process.env.NODE_ENV').length - 1;
  if (count !== expected) throw new Error(`Unexpected guard count in ${path}`);
  writeFileSync(path, text.replaceAll('process.env.NODE_ENV', 'process.env.CAPACITY_PROVIDER_MODE'));
}
// Do not put synthetic OTPs in task logs.
const otpPath = 'src/server/guest-otp.ts';
writeFileSync(otpPath, readFileSync(otpPath, 'utf8').replace(
  "console.log(`[LOCAL DEV OTP] Email: ${email} | Code: ${otpCode} | Purpose: ${purpose}`);",
  '// Synthetic OTP returned only to the isolated driver, never logged.',
));
