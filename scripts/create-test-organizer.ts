import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { createDatabasePool, inTransaction } from '../src/server/database.ts';

const pool = createDatabasePool();

const email = process.env.TEST_ORGANIZER_EMAIL || 'organizer@ticket.local';
const password = process.env.TEST_ORGANIZER_PASSWORD || 'Password123!';
const name = process.env.TEST_ORGANIZER_NAME || 'ผู้จัดงานทดสอบ';

try {
  const existing = await pool.query('SELECT id, role FROM auth_user WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    console.log(`\nมีบัญชีอีเมล ${email} อยู่แล้วในระบบ (สิทธิ์: ${existing.rows[0].role})`);
  } else {
    const userId = randomUUID();
    const accountId = randomUUID();
    const hashedPassword = await hashPassword(password);

    await inTransaction(pool, async client => {
      await client.query(
        'INSERT INTO auth_user (id, name, email, "emailVerified", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, false, $4, now(), now())',
        [userId, name, email, 'organizer']
      );
      await client.query(
        'INSERT INTO auth_account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, now(), now())',
        [accountId, userId, 'credential', userId, hashedPassword]
      );
    });

    console.log('\n=== สร้างบัญชีผู้จัดงานทดสอบสำเร็จ ===');
    console.log(`ชื่อ: ${name}`);
    console.log(`อีเมล: ${email}`);
    console.log(`รหัสผ่าน: ${password}`);
    console.log(`สิทธิ์: organizer`);
    console.log('สามารถล็อกอินได้ที่ http://localhost:3000/login\n');
  }
} catch (error) {
  console.error('เกิดข้อผิดพลาดในการสร้างบัญชี:', error);
} finally {
  await pool.end();
}
