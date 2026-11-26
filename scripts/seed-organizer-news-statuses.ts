import { createDatabasePool } from '../src/server/database.ts';
import { ensureNewsSchema } from '../src/server/news.ts';
import { createNotification, ensureNotificationSchema } from '../src/server/notifications.ts';

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Ignore if .env.local does not exist
  }
}

const pool = createDatabasePool();

try {
  await ensureNewsSchema(pool);
  await ensureNotificationSchema(pool);

  const orgRes = await pool.query<{ id: string; name: string; email: string }>(
    `SELECT id, name, email
     FROM auth_user
     WHERE role = 'organizer'
     ORDER BY "createdAt" ASC
     LIMIT 1`,
  );

  if ((orgRes.rowCount ?? 0) === 0) {
    throw new Error('ไม่พบบัญชีผู้จัดงาน (role = organizer) ในฐานข้อมูล');
  }

  const organizer = orgRes.rows[0];

  const evRes = await pool.query<{ id: string; title: string }>(
    `SELECT id, title
     FROM events
     WHERE "organizerId" = $1 AND status = 'approved'
     ORDER BY "createdAt" DESC
     LIMIT 1`,
    [organizer.id],
  );

  const relatedEvent = evRes.rows[0] ?? null;

  const seedItems: Array<{
    id: string;
    title: string;
    summary: string;
    content: string;
    category: string;
    status: 'draft' | 'pending' | 'published' | 'rejected';
    rejectionReason: string | null;
    publishedNow: boolean;
  }> = [
    {
      id: 'seed-news-status-draft',
      title: 'เตรียมเปิดเผยรายชื่อศิลปินรับเชิญพิเศษประจำงานคอนเสิร์ต',
      summary:
        'ฉบับร่างข่าวประชาสัมพันธ์เปิดตัวศิลปินรับเชิญพิเศษและตารางกิจกรรมหน้างาน เตรียมตรวจสอบรายละเอียดก่อนส่งอนุมัติ',
      content:
        'ทีมผู้จัดงานกำลังเตรียมข้อมูลรายชื่อศิลปินรับเชิญพิเศษและโซนกิจกรรมหน้างานสำหรับผู้ถือบัตรทุกประเภท โดยจะเปิดเผยรายชื่ออย่างเป็นทางการหลังยืนยันตารางเวลาเรียบร้อยแล้ว',
      category: 'ประชาสัมพันธ์คอนเสิร์ต',
      status: 'draft',
      rejectionReason: null,
      publishedNow: false,
    },
    {
      id: 'seed-news-status-pending',
      title: 'แจ้งเปิดจองบัตรรอบ Early Bird และสิทธิพิเศษสำหรับนักศึกษา ม.อุบลฯ',
      summary:
        'ข่าวประชาสัมพันธ์ที่ส่งเข้าสู่ระบบเพื่อรอเจ้าของระบบตรวจสอบและอนุมัติเผยแพร่',
      content:
        'เปิดจำหน่ายบัตรรอบ Early Bird พร้อมสิทธิพิเศษส่วนลดสำหรับนักศึกษาและบุคลากร มหาวิทยาลัยอุบลราชธานี จำนวนจำกัด สามารถตรวจสอบเงื่อนไขและเลือกซื้อบัตรได้ผ่านหน้างานคอนเสิร์ต',
      category: 'กิจกรรมและสิทธิพิเศษ',
      status: 'pending',
      rejectionReason: null,
      publishedNow: false,
    },
    {
      id: 'seed-news-status-published',
      title: 'ข้อปฏิบัติและจุดตรวจเข้างานคอนเสิร์ต ประตูเปิดเวลา 16:00 น.',
      summary:
        'ข้อปฏิบัติสำคัญสำหรับผู้เข้าร่วมงาน กรุณาเตรียม QR Code บัตรเข้างานและบัตรประจำตัวเพื่อความรวดเร็วที่จุดคัดกรอง',
      content:
        'ประตูทางเข้าหลักเปิดให้บริการตั้งแต่เวลา 16:00 น. เป็นต้นไป ขอความร่วมมือผู้เข้าร่วมงานเตรียม E-Ticket ที่มี QR Code พร้อมบัตรประจำตัวประชาชนหรือบัตรนักศึกษา เพื่อความสะดวกรวดเร็วในการตรวจบัตรเข้างาน',
      category: 'ประกาศสำคัญ',
      status: 'published',
      rejectionReason: null,
      publishedNow: true,
    },
    {
      id: 'seed-news-status-rejected',
      title: 'ประกาศเปลี่ยนแปลงตารางเวลาขึ้นแสดงบนเวทีหลัก',
      summary:
        'ประกาศปรับลำดับเวลาการแสดงบนเวทีหลัก (รอแก้ไขรายละเอียดเพิ่มเติมตามข้อเสนอแนะจากผู้ดูแลระบบ)',
      content:
        'แจ้งปรับเปลี่ยนลำดับเวลาการแสดงของศิลปินบนเวทีหลักเพื่อความเหมาะสมของการจัดการจราจรภายในงาน ขอให้ผู้เข้าชมตรวจสอบเวลาก่อนเดินทาง',
      category: 'อัปเดตและแจ้งเตือน',
      status: 'rejected',
      rejectionReason:
        'กรุณาระบุเวลาแสดงของแต่ละวงให้ชัดเจนเป็นรายชั่วโมง และตรวจสอบชื่อเวทีให้ตรงกับผังงานก่อนส่งอนุมัติใหม่',
      publishedNow: false,
    },
  ];

  for (const item of seedItems) {
    await pool.query(
      `INSERT INTO news (
         id, title, content, summary, category,
         "relatedEventId", "relatedConcert",
         status, "rejectionReason", "publishedAt",
         "authorId", "authorRole", "createdAt", "updatedAt"
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7,
         $8, $9, ${item.publishedNow ? 'NOW()' : 'NULL'},
         $10, 'organizer', NOW(), NOW()
       )
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         summary = EXCLUDED.summary,
         category = EXCLUDED.category,
         "relatedEventId" = EXCLUDED."relatedEventId",
         "relatedConcert" = EXCLUDED."relatedConcert",
         status = EXCLUDED.status,
         "rejectionReason" = EXCLUDED."rejectionReason",
         "publishedAt" = EXCLUDED."publishedAt",
         "authorId" = EXCLUDED."authorId",
         "authorRole" = EXCLUDED."authorRole",
         "updatedAt" = NOW()`,
      [
        item.id,
        item.title,
        item.content,
        item.summary,
        item.category,
        relatedEvent?.id ?? null,
        relatedEvent?.title ?? null,
        item.status,
        item.rejectionReason,
        organizer.id,
      ],
    );
  }

  const existingNotif = await pool.query(
    `SELECT 1 FROM admin_notifications WHERE "referenceId" = $1 AND role = 'owner' LIMIT 1`,
    ['seed-news-status-pending'],
  );
  if ((existingNotif.rowCount ?? 0) === 0) {
    await createNotification(pool, {
      role: 'owner',
      title: 'มีคำขออนุมัติข่าวสารใหม่จากผู้จัดงาน',
      summary: `ผู้จัดงาน ${organizer.name} ส่งข่าวสาร "${seedItems[1].title}" เพื่อรอการตรวจสอบและอนุมัติ`,
      content: `ข่าวสารหัวข้อ "${seedItems[1].title}" หมวดหมู่ ${seedItems[1].category} ถูกส่งเข้าสู่ระบบเพื่อรอการเผยแพร่`,
      category: 'system',
      referenceId: 'seed-news-status-pending',
    });
  }

  const countRes = await pool.query<{ status: string; total: string }>(
    `SELECT status, COUNT(*)::text AS total
     FROM news
     WHERE "authorId" = $1
     GROUP BY status
     ORDER BY status ASC`,
    [organizer.id],
  );

  console.log(`Seeded 4 news statuses for organizer ${organizer.email}:`);
  for (const row of countRes.rows) {
    console.log(`- ${row.status}: ${row.total}`);
  }
} finally {
  await pool.end();
}
