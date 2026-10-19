import { createDatabasePool } from '../src/server/database.ts';
import { bootstrapOwner } from '../src/server/bootstrap-owner.ts';

// JSON through stdin keeps the password out of argv and command history.
// No default account/password and no credential values are written to output.
if (process.stdin.isTTY) {
  console.error('ส่ง JSON {name,email,password} ผ่าน stdin จาก secret manager หรือไฟล์ local ที่ป้องกันไว้ ดู README');
  process.exitCode = 1;
} else {
  let content = '';
  for await (const chunk of process.stdin) {
    content += chunk.toString();
    if (content.length > 4096) { console.error('ข้อมูลตั้งค่าบัญชียาวเกินไป'); process.exit(1); }
  }
  const pool = createDatabasePool();
  try {
    await bootstrapOwner(pool, JSON.parse(content));
    console.log('สร้างบัญชีเจ้าของเว็บแล้ว');
  } catch {
    console.error('สร้างบัญชีไม่ได้ ตรวจรูปแบบข้อมูล ฐานข้อมูล และการมี owner เดิม; ไม่มีบัญชีหรือรหัสผ่านใดถูกเปลี่ยนทับ');
    process.exitCode = 1;
  } finally { await pool.end(); }
}
