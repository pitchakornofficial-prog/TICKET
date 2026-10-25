import { createDatabasePool } from '../src/server/database.ts';

const pool = createDatabasePool();

try {
  const result = await pool.query(
    'SELECT email, token, status, "createdAt" FROM organizer_invitations ORDER BY "createdAt" DESC LIMIT 1'
  );

  if (result.rows.length === 0) {
    console.log('\nยังไม่มีคำเชิญในระบบ กรุณาเข้าสู่ระบบ Owner แล้วสร้างคำเชิญที่เมนู "ระบบ" ก่อนครับ');
  } else {
    const invite = result.rows[0];
    console.log('\n=== ข้อมูลคำเชิญล่าสุด ===');
    console.log(`อีเมล: ${invite.email}`);
    console.log(`สถานะ: ${invite.status}`);
    console.log(`สร้างเมื่อ: ${new Date(invite.createdAt).toLocaleString('th-TH')}`);
    console.log(`ลิงก์สำหรับตอบรับคำเชิญ:\nhttp://localhost:3000/accept-invitation?token=${invite.token}\n`);
  }
} catch (error) {
  console.error('เกิดข้อผิดพลาดในการดึงข้อมูลคำเชิญ:', error);
} finally {
  await pool.end();
}
