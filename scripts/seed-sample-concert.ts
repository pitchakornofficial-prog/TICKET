import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { createDatabasePool, inTransaction } from '../src/server/database.ts';
import { ensureEventSchema } from '../src/server/events.ts';
import { ensureFeeSchema } from '../src/server/fees.ts';

const pool = createDatabasePool();

try {
  await ensureEventSchema(pool);
  await ensureFeeSchema(pool);

  // 1. Get or create organizer user
  let organizerId: string;
  const organizerRes = await pool.query(
    "SELECT id FROM auth_user WHERE role = 'organizer' LIMIT 1"
  );

  if (organizerRes.rows.length > 0) {
    organizerId = organizerRes.rows[0].id;
  } else {
    organizerId = randomUUID();
    const accountId = randomUUID();
    const hashed = await hashPassword('Password123!');
    await inTransaction(pool, async client => {
      await client.query(
        'INSERT INTO auth_user (id, name, email, "emailVerified", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, false, $4, now(), now())',
        [organizerId, 'ผู้จัดงานดนตรีสด', 'organizer@ticket.local', 'organizer']
      );
      await client.query(
        'INSERT INTO auth_account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, now(), now())',
        [accountId, organizerId, 'credential', organizerId, hashed]
      );
    });
    console.log('สร้างบัญชีผู้จัดงานใหม่: organizer@ticket.local / Password123!');
  }

  // 2. Check if sample concert already exists
  const existingConcert = await pool.query(
    "SELECT id, title FROM events WHERE title = 'NEON NIGHTS LIVE BANGKOK 2026' LIMIT 1"
  );

  let eventId: string;
  if (existingConcert.rows.length > 0) {
    eventId = existingConcert.rows[0].id;
    console.log(`\nมีคอนเสิร์ตตัวอย่าง "${existingConcert.rows[0].title}" อยู่แล้ว`);
    await pool.query(
      `UPDATE events SET "posterUrl" = '/banners/neon-nights.svg' WHERE id = $1`,
      [eventId]
    );
  } else {
    eventId = randomUUID();
    const session1Id = randomUUID();
    const session2Id = randomUUID();

    await inTransaction(pool, async client => {
      // Insert Event
      await client.query(
        `INSERT INTO events (id, "organizerId", title, description, location, "posterUrl", "limitPerOrder", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', now(), now())`,
        [
          eventId,
          organizerId,
          'NEON NIGHTS LIVE BANGKOK 2026',
          'คอนเสิร์ตใหญ่เต็มรูปแบบระดับเวิลด์คลาส แสง สี เสียงจัดเต็ม พบกับไลน์อัพศิลปินร็อกและป๊อปแถวหน้า พร้อมเวทีโปรดักชัน 360 องศา สัมผัสประสบการณ์ดนตรีสดสุดประทับใจที่คุณไม่ควรพลาด',
          'อิมแพ็ค อารีน่า เมืองทองธานี (Impact Arena)',
          null,
          4,
        ]
      );

      // Insert Fee Settings
      await client.query(
        `INSERT INTO event_fee_settings ("eventId", "organizerFeeMode", "organizerFeeRate", "customerFeeMode", "customerFeeRate", "reservePercentage", "organizerFeeLocked", "createdAt", "updatedAt")
         VALUES ($1, 'percentage', 5, 'per_ticket', 20, 10, false, now(), now())
         ON CONFLICT ("eventId") DO NOTHING`,
        [eventId]
      );

      // Insert Session 1 (วันเสาร์ที่ 14 พ.ย. 2026 19:00 - 22:00)
      await client.query(
        `INSERT INTO event_sessions (id, "eventId", "startTime", "endTime", "admissionStartTime", "admissionEndTime", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'approved', now(), now())`,
        [
          session1Id,
          eventId,
          new Date('2026-11-14T19:00:00+07:00'),
          new Date('2026-11-14T22:00:00+07:00'),
          new Date('2026-11-14T17:00:00+07:00'),
          new Date('2026-11-14T20:00:00+07:00'),
        ]
      );

      // Insert Ticket Types for Session 1
      const s1Tickets = [
        { name: 'VIP Zone (บัตรนั่งแถวหน้า + โปสเตอร์พร้อมลายเซ็น)', price: 3500, quota: 80, desc: 'ที่นั่งแถวหน้า เวทีชัดเจน พร้อมรับของที่ระลึกและโปสเตอร์' },
        { name: 'Standing Zone A (บัตรยืนโซนหน้าเวที)', price: 2500, quota: 250, desc: 'บัตรยืนติดขอบเวที สัมผัสศิลปินใกล้ชิด' },
        { name: 'Standing Zone B (บัตรยืนโซนกลาง)', price: 1800, quota: 400, desc: 'บัตรยืนมองเห็นเวทีและเอฟเฟกต์รอบทิศทาง' },
        { name: 'Seated Zone C (บัตรนั่งอัฒจันทร์)', price: 1200, quota: 500, desc: 'ที่นั่งชั้น 2 และ 3 มุมมองพาโนรามา' },
      ];

      for (const t of s1Tickets) {
        await client.query(
          `INSERT INTO ticket_types (id, "sessionId", name, price, quota, description, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
          [randomUUID(), session1Id, t.name, t.price, t.quota, t.desc]
        );
      }

      // Insert Session 2 (วันอาทิตย์ที่ 15 พ.ย. 2026 18:00 - 21:00)
      await client.query(
        `INSERT INTO event_sessions (id, "eventId", "startTime", "endTime", "admissionStartTime", "admissionEndTime", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'approved', now(), now())`,
        [
          session2Id,
          eventId,
          new Date('2026-11-15T18:00:00+07:00'),
          new Date('2026-11-15T21:00:00+07:00'),
          new Date('2026-11-15T16:00:00+07:00'),
          new Date('2026-11-15T19:00:00+07:00'),
        ]
      );

      // Insert Ticket Types for Session 2
      const s2Tickets = [
        { name: 'VIP Zone (บัตรนั่งแถวหน้า + โปสเตอร์พร้อมลายเซ็น)', price: 3500, quota: 80, desc: 'ที่นั่งแถวหน้า เวทีชัดเจน พร้อมรับของที่ระลึกและโปสเตอร์' },
        { name: 'Standing Zone A (บัตรยืนโซนหน้าเวที)', price: 2500, quota: 250, desc: 'บัตรยืนติดขอบเวที สัมผัสศิลปินใกล้ชิด' },
        { name: 'Standing Zone B (บัตรยืนโซนกลาง)', price: 1800, quota: 400, desc: 'บัตรยืนมองเห็นเวทีและเอฟเฟกต์รอบทิศทาง' },
        { name: 'Seated Zone C (บัตรนั่งอัฒจันทร์)', price: 1200, quota: 500, desc: 'ที่นั่งชั้น 2 และ 3 มุมมองพาโนรามา' },
      ];

      for (const t of s2Tickets) {
        await client.query(
          `INSERT INTO ticket_types (id, "sessionId", name, price, quota, description, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
          [randomUUID(), session2Id, t.name, t.price, t.quota, t.desc]
        );
      }
    });

    console.log('\n=== เพิ่มคอนเสิร์ตตัวอย่างสำเร็จ ===');
    console.log('ชื่องาน: NEON NIGHTS LIVE BANGKOK 2026');
    console.log('สถานที่: อิมแพ็ค อารีน่า เมืองทองธานี (Impact Arena)');
    console.log('รอบการแสดง: 2 รอบ (14 พ.ย. 2026 และ 15 พ.ย. 2026)');
    console.log('ราคาบัตรเริ่มต้น: 1,200 - 3,500 บาท');
    console.log(`Event ID: ${eventId}`);
  }

  // 2.1 Check if second sample concert exists
  const existingConcert2 = await pool.query(
    "SELECT id, title FROM events WHERE title = 'SUMMER SOUND FESTIVAL 2026' LIMIT 1"
  );
  if (existingConcert2.rows.length === 0) {
    const event2Id = randomUUID();
    const session2Id = randomUUID();
    await inTransaction(pool, async client => {
      await client.query(
        `INSERT INTO events (id, "organizerId", title, description, location, "posterUrl", "limitPerOrder", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', now(), now())`,
        [
          event2Id,
          organizerId,
          'SUMMER SOUND FESTIVAL 2026',
          'เทศกาลดนตรีฤดูร้อนสุดยิ่งใหญ่ รวมศิลปินอินดี้ ป๊อป และฮิปฮอปร่วม 30 วง บน 3 เวทีหลักริมหาดและลานกลางแจ้ง เต็มอิ่มกับแสงสีเสียงและกิจกรรมมาร์เก็ตตลอดสุดสัปดาห์',
          'ไบเทค บางนา (BITEC Bangna Hall 98-99)',
          '/banners/summer-sound.svg',
          6,
        ]
      );
      await client.query(
        `INSERT INTO event_fee_settings ("eventId", "organizerFeeMode", "organizerFeeRate", "customerFeeMode", "customerFeeRate", "reservePercentage", "organizerFeeLocked", "createdAt", "updatedAt")
         VALUES ($1, 'percentage', 5, 'per_ticket', 20, 10, false, now(), now())
         ON CONFLICT ("eventId") DO NOTHING`,
        [event2Id]
      );
      await client.query(
        `INSERT INTO event_sessions (id, "eventId", "startTime", "endTime", "admissionStartTime", "admissionEndTime", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'approved', now(), now())`,
        [
          session2Id,
          event2Id,
          new Date('2026-11-28T16:00:00+07:00'),
          new Date('2026-11-28T23:30:00+07:00'),
          new Date('2026-11-28T14:00:00+07:00'),
          new Date('2026-11-28T21:00:00+07:00'),
        ]
      );
      const tickets = [
        { name: '1-Day Pass (Early Bird)', price: 1500, quota: 300, desc: 'บัตรเข้างาน 1 วัน เข้าได้ทุกเวที' },
        { name: '2-Day Pass (Full Weekend)', price: 2600, quota: 500, desc: 'บัตรเข้างานตลอด 2 วันสุดสัปดาห์' },
        { name: 'VIP Weekend Lounge Pass', price: 4200, quota: 100, desc: 'บัตรเข้างาน 2 วัน พร้อมโซนพักผ่อน VIP เครื่องดื่มฟรี และจุดชมวิวเวทีหลัก' },
      ];
      for (const t of tickets) {
        await client.query(
          `INSERT INTO ticket_types (id, "sessionId", name, price, quota, description, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
          [randomUUID(), session2Id, t.name, t.price, t.quota, t.desc]
        );
      }
    });
    console.log('เพิ่มคอนเสิร์ตตัวอย่างที่ 2: SUMMER SOUND FESTIVAL 2026');
  }

  // 2.2 Check if third sample concert exists
  const existingConcert3 = await pool.query(
    "SELECT id, title FROM events WHERE title = 'ACOUSTIC ECHOES IN THE HALL 2026' LIMIT 1"
  );
  if (existingConcert3.rows.length === 0) {
    const event3Id = randomUUID();
    const session3Id = randomUUID();
    await inTransaction(pool, async client => {
      await client.query(
        `INSERT INTO events (id, "organizerId", title, description, location, "posterUrl", "limitPerOrder", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', now(), now())`,
        [
          event3Id,
          organizerId,
          'ACOUSTIC ECHOES IN THE HALL 2026',
          'ค่ำคืนแห่งเสียงเพลงอะคูสติกนุ่มลึกในบรรยากาศฮอลล์คอนเสิร์ตระดับพรีเมียม สัมผัสท่วงทำนองเปียโน กีตาร์โปร่ง และวงเครื่องสายออเคสตราสุดอบอุ่น',
          'ยูโอบี ไลฟ์ เอ็มสเฟียร์ (UOB LIVE at EMSPHERE)',
          null,
          4,
        ]
      );
      await client.query(
        `INSERT INTO event_fee_settings ("eventId", "organizerFeeMode", "organizerFeeRate", "customerFeeMode", "customerFeeRate", "reservePercentage", "organizerFeeLocked", "createdAt", "updatedAt")
         VALUES ($1, 'percentage', 5, 'per_ticket', 20, 10, false, now(), now())
         ON CONFLICT ("eventId") DO NOTHING`,
        [event3Id]
      );
      await client.query(
        `INSERT INTO event_sessions (id, "eventId", "startTime", "endTime", "admissionStartTime", "admissionEndTime", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'approved', now(), now())`,
        [
          session3Id,
          event3Id,
          new Date('2026-12-12T18:30:00+07:00'),
          new Date('2026-12-12T21:30:00+07:00'),
          new Date('2026-12-12T17:00:00+07:00'),
          new Date('2026-12-12T19:30:00+07:00'),
        ]
      );
      const tickets3 = [
        { name: 'Standard Hall Seat', price: 1800, quota: 250, desc: 'ที่นั่งโซนฮอลล์ บรรยากาศอบอุ่น' },
        { name: 'Front Stage Premium Seat', price: 3200, quota: 120, desc: 'ที่นั่งแถวหน้า ชิดขอบเวทีอะคูสติก' },
      ];
      for (const t of tickets3) {
        await client.query(
          `INSERT INTO ticket_types (id, "sessionId", name, price, quota, description, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
          [randomUUID(), session3Id, t.name, t.price, t.quota, t.desc]
        );
      }
    });
    console.log('เพิ่มคอนเสิร์ตตัวอย่างที่ 3: ACOUSTIC ECHOES IN THE HALL 2026');
  }

  // 3. Ensure a scanner account exists and is assigned
  let scannerId: string;
  const scannerRes = await pool.query(
    "SELECT id FROM auth_user WHERE role = 'scanner' LIMIT 1"
  );

  if (scannerRes.rows.length > 0) {
    scannerId = scannerRes.rows[0].id;
  } else {
    scannerId = randomUUID();
    const accountId = randomUUID();
    const hashed = await hashPassword('Password123!');
    await inTransaction(pool, async client => {
      await client.query(
        'INSERT INTO auth_user (id, name, email, "emailVerified", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, false, $4, now(), now())',
        [scannerId, 'ทีมสแกนประตู 1', 'scanner@ticket.local', 'scanner']
      );
      await client.query(
        'INSERT INTO auth_account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, now(), now())',
        [accountId, scannerId, 'credential', scannerId, hashed]
      );
    });
    console.log('สร้างบัญชีทีมสแกนใหม่: scanner@ticket.local / Password123!');
  }

  // Assign scanner to event
  await pool.query(
    `INSERT INTO event_scanners (id, "eventId", "scannerId", "assignedAt")
     VALUES ($1, $2, $3, now())
     ON CONFLICT ("eventId", "scannerId") DO NOTHING`,
    [randomUUID(), eventId, scannerId]
  );

  // Set as primary scanner
  await pool.query(
    `INSERT INTO event_primary_scanners ("eventId", "scannerId", "scannerName", "scannerEmail", "deviceId", "assignedAt", "assignedBy")
     VALUES ($1, $2, 'ทีมสแกนประตู 1', 'scanner@ticket.local', 'DEVICE-MAIN-GATE-01', now(), $3)
     ON CONFLICT ("eventId") DO UPDATE SET "scannerId" = $2, "scannerName" = 'ทีมสแกนประตู 1', "scannerEmail" = 'scanner@ticket.local'`,
    [eventId, scannerId, organizerId]
  );

  // Update all banner image paths
  await pool.query(
    "UPDATE events SET \"posterUrl\" = '/banners/neon-nights.svg' WHERE title = 'NEON NIGHTS LIVE BANGKOK 2026'"
  );
  await pool.query(
    "UPDATE events SET \"posterUrl\" = '/banners/summer-sound.svg' WHERE title = 'SUMMER SOUND FESTIVAL 2026'"
  );
  await pool.query(
    "UPDATE events SET \"posterUrl\" = '/banners/acoustic-echoes.svg' WHERE title = 'ACOUSTIC ECHOES IN THE HALL 2026'"
  );

  console.log(`\nลิงก์ดูหน้าคอนเสิร์ต: http://localhost:3000/events/${eventId}`);
  console.log('ลิงก์หน้าแรก: http://localhost:3000/');
  console.log('--------------------------------------------------\n');
} catch (error) {
  console.error('เกิดข้อผิดพลาดในการสร้างคอนเสิร์ตตัวอย่าง:', error);
} finally {
  await pool.end();
}
