import { createDatabasePool } from '../src/server/database.ts';

const pool = createDatabasePool();

try {
  console.log('--- Revoking lingering tokens (Security Remediation) ---');

  // 1. Password reset tokens
  const resetRes = await pool.query(`
    DELETE FROM auth_verification
    WHERE identifier LIKE 'reset-password:%'
  `);
  console.log(`✓ Revoked ${resetRes.rowCount ?? 0} active/pending password reset tokens`);

  // 2. Guest OTPs
  try {
    const otpRes = await pool.query(`
      UPDATE guest_otp
      SET "consumedAt" = now()
      WHERE "consumedAt" IS NULL
    `);
    console.log(`✓ Expired ${otpRes.rowCount ?? 0} active guest OTPs`);
  } catch {
    console.log('• guest_otp table not initialized or absent; skipped');
  }

  // 3. Organizer Invitations
  try {
    const invRes = await pool.query(`
      UPDATE organizer_invitations
      SET "expiresAt" = now()
      WHERE "acceptedAt" IS NULL AND "expiresAt" > now()
    `);
    console.log(`✓ Expired ${invRes.rowCount ?? 0} pending organizer invitations`);
  } catch {
    console.log('• organizer_invitations table not initialized or absent; skipped');
  }

  console.log('\n--- Access Log Inspection Notice ---');
  console.log('To verify whether this endpoint was ever accessed externally, check your web server / CDN access logs:');
  console.log('  grep "/api/auth/test-inspect-reset-token" <access.log>');
  console.log('If any unauthorized requests occurred, verify the affected user accounts and reset their passwords.');
} catch (error) {
  console.error('Failed to revoke tokens:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
