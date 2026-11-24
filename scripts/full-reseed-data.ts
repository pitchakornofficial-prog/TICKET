import { createDatabasePool } from '../src/server/database.ts';
import { randomUUID } from 'node:crypto';

async function main() {
  const pool = createDatabasePool();
  const client = await pool.connect();

  try {
    console.log('=== STARTING DATABASE RESEED ===');

    // 1. Check existing users
    const userRes = await client.query('SELECT id, email, name, role FROM auth_user');
    console.log('Existing users before clean:', userRes.rows);

    const ownerUser = userRes.rows.find(u => u.role === 'owner' || u.email === 'owner@ticket.local');
    const orgUser = userRes.rows.find(u => u.email === 'organizer.freshy@ubu.ac.th' || (u.role === 'organizer' && u.name?.includes('สโมสร')));

    if (!ownerUser) {
      throw new Error('ไม่พบบัญชี Owner ในระบบ');
    }
    const ownerId = ownerUser.id;
    const ownerEmail = ownerUser.email;
    console.log(`Preserving Owner: ${ownerEmail} (${ownerId})`);

    let organizerId = orgUser?.id;
    const organizerEmail = orgUser?.email || 'organizer.freshy@ubu.ac.th';
    const organizerName = 'สโมสรนักศึกษา มหาวิทยาลัยอุบลราชธานี';

    if (!orgUser) {
      console.log('Creating fresh organizer account...');
      organizerId = 'org-freshy-fest-ubu';
      await client.query(
        `INSERT INTO auth_user (id, email, name, role, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'organizer', true, now(), now())
         ON CONFLICT (id) DO UPDATE SET name = $3, role = 'organizer'`,
        [organizerId, organizerEmail, organizerName]
      );
    } else {
      console.log(`Preserving Organizer: ${organizerEmail} (${organizerId})`);
      await client.query(`UPDATE auth_user SET name = $1 WHERE id = $2`, [organizerName, organizerId]);
    }

    const preservedUserIds = [ownerId, organizerId];

    await client.query('BEGIN');

    // 2. Clear all transactional, ticket, order, admission, refund, and back-office tables
    console.log('Clearing old transactions, tickets, orders, refunds...');
    const tablesToDelete = [
      'refund_request_items',
      'refund_requests',
      'refund_liabilities',
      'ticket_admission_logs',
      'admission_sync_conflicts',
      'ticket_email_deliveries',
      'order_contact_audit_logs',
      'order_transaction_memos',
      'tickets',
      'order_items',
      'orders',
      'ticket_type_paid_buckets',
      'event_payouts',
      'event_debt_repayments',
      'event_reserve_releases',
      'event_fee_settings',
      'event_scanners',
      'event_primary_scanners',
      'event_offline_controls',
      'primary_scanner_handovers',
      'scanner_dataset_syncs',
      'session_amendments',
      'session_cancellations',
      'ticket_types',
      'event_sessions',
      'events',
      'news',
      'organizer_invitations',
      'inbound_email_replies',
      'inbound_emails',
      'notifications'
    ];

    for (const table of tablesToDelete) {
      try {
        await client.query(`SAVEPOINT sp_del`);
        await client.query(`DELETE FROM "${table}"`);
        await client.query(`RELEASE SAVEPOINT sp_del`);
      } catch (_err: unknown) {
        await client.query(`ROLLBACK TO SAVEPOINT sp_del`);
        // Table might not exist or already empty, ignore
      }
    }

    // 3. Clear users except owner and organizer
    console.log('Clearing users except owner and organizer...');
    await client.query(
      `DELETE FROM auth_session WHERE "userId" NOT IN ($1, $2)`,
      preservedUserIds
    ).catch(() => {});

    await client.query(
      `DELETE FROM auth_account WHERE "userId" NOT IN ($1, $2)`,
      preservedUserIds
    ).catch(() => {});

    await client.query(
      `DELETE FROM auth_user WHERE id NOT IN ($1, $2)`,
      preservedUserIds
    );

    // 4. Create Concerts covering EVERY status:
    // Statuses: 'approved', 'pending_approval', 'draft', 'rejected', 'cancelled'
    console.log('Creating concerts covering every status...');

    const now = new Date();

    // 4.1 Concert 1: APPROVED (เปิดขายบัตร) - UBU Freshy Music Fest 2026
    const eventApprovedId = 'event-ubu-freshy-2026';
    const sessionApprovedId = 'session-ubu-freshy-2026-s1';
    const ttRegularId = 'tt-ubu-freshy-regular';
    const ttVipId = 'tt-ubu-freshy-vip';
    const ttStudentId = 'tt-ubu-freshy-student';

    await client.query(
      `INSERT INTO events (
        id, "organizerId", title, description, location,
        status, "salesStartTime", "salesEndTime", "limitPerOrder",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, 'approved', $6, $7, 4, now(), now())`,
      [
        eventApprovedId,
        organizerId,
        'UBU Freshy Music Fest 2026',
        'เทศกาลดนตรีต้อนรับเพื่อนใหม่ มหาวิทยาลัยอุบลราชธานี ครั้งยิ่งใหญ่ที่สุดแห่งปี',
        'ศูนย์กีฬาอเนกประสงค์ มหาวิทยาลัยอุบลราชธานี',
        new Date(now.getTime() - 7 * 86400000),
        new Date(now.getTime() + 30 * 86400000),
      ]
    );

    await client.query(
      `INSERT INTO event_sessions (
        id, "eventId", "startTime", "endTime", "admissionStartTime", "admissionEndTime",
        status, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, 'approved', now(), now())`,
      [
        sessionApprovedId,
        eventApprovedId,
        new Date(now.getTime() + 14 * 86400000),
        new Date(now.getTime() + 14 * 86400000 + 6 * 3600000),
        new Date(now.getTime() + 14 * 86400000 - 2 * 3600000),
        new Date(now.getTime() + 14 * 86400000 + 5 * 3600000),
      ]
    );

    await client.query(
      `INSERT INTO ticket_types (id, "sessionId", name, price, quota, "isStudentPrivilege", "studentPrice", "createdAt", "updatedAt")
       VALUES 
       ($1, $2, 'Regular (บัตรทั่วไป)', 350, 500, false, null, now(), now()),
       ($3, $2, 'VIP Front Row', 800, 100, false, null, now(), now()),
       ($4, $2, 'Student Special (นักศึกษา ม.อุบลฯ)', 200, 300, true, 200, now(), now())`,
      [ttRegularId, sessionApprovedId, ttVipId, ttStudentId]
    );

    // 4.2 Concert 2: PENDING_APPROVAL (รอตรวจสอบ/รออนุมัติ) - UBU Acoustic Night 2026
    const eventPendingId = 'event-ubu-acoustic-2026';
    const sessionPendingId = 'session-ubu-acoustic-s1';
    await client.query(
      `INSERT INTO events (
        id, "organizerId", title, description, location,
        status, "salesStartTime", "salesEndTime", "limitPerOrder",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, 'pending_approval', $6, $7, 4, now(), now())`,
      [
        eventPendingId,
        organizerId,
        'UBU Acoustic Night 2026',
        'ค่ำคืนดนตรีอะคูสติกฟังสบายริมสระบัว มหาวิทยาลัยอุบลราชธานี',
        'ลานริมสระบัว มหาวิทยาลัยอุบลราชธานี',
        new Date(now.getTime() + 5 * 86400000),
        new Date(now.getTime() + 25 * 86400000),
      ]
    );
    await client.query(
      `INSERT INTO event_sessions (
        id, "eventId", "startTime", "endTime", "admissionStartTime", "admissionEndTime",
        status, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending_approval', now(), now())`,
      [
        sessionPendingId,
        eventPendingId,
        new Date(now.getTime() + 20 * 86400000),
        new Date(now.getTime() + 20 * 86400000 + 4 * 3600000),
        new Date(now.getTime() + 20 * 86400000 - 1 * 3600000),
        new Date(now.getTime() + 20 * 86400000 + 3 * 3600000),
      ]
    );
    await client.query(
      `INSERT INTO ticket_types (id, "sessionId", name, price, quota, "isStudentPrivilege", "studentPrice", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Acoustic Pass', 250, 200, false, null, now(), now())`,
      ['tt-ubu-acoustic-ga', sessionPendingId]
    );

    // 4.3 Concert 3: DRAFT (ฉบับร่าง) - Isan Indy Rock Fest 2026
    const eventDraftId = 'event-ubu-isan-indy-2026';
    const sessionDraftId = 'session-ubu-isan-indy-s1';
    await client.query(
      `INSERT INTO events (
        id, "organizerId", title, description, location,
        status, "salesStartTime", "salesEndTime", "limitPerOrder",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, 4, now(), now())`,
      [
        eventDraftId,
        organizerId,
        'Isan Indy Rock Fest 2026',
        'การรวมตัวของวงดนตรีร็อกอินดี้แดนอีสานและศิลปินนักศึกษา',
        'ลานกิจกรรมกลางแจ้ง มหาวิทยาลัยอุบลราชธานี',
        new Date(now.getTime() + 10 * 86400000),
        new Date(now.getTime() + 45 * 86400000),
      ]
    );
    await client.query(
      `INSERT INTO event_sessions (
        id, "eventId", "startTime", "endTime", "admissionStartTime", "admissionEndTime",
        status, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, 'draft', now(), now())`,
      [
        sessionDraftId,
        eventDraftId,
        new Date(now.getTime() + 35 * 86400000),
        new Date(now.getTime() + 35 * 86400000 + 6 * 3600000),
        new Date(now.getTime() + 35 * 86400000 - 2 * 3600000),
        new Date(now.getTime() + 35 * 86400000 + 5 * 3600000),
      ]
    );
    await client.query(
      `INSERT INTO ticket_types (id, "sessionId", name, price, quota, "isStudentPrivilege", "studentPrice", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Early Bird Pass', 400, 150, false, null, now(), now())`,
      ['tt-ubu-isan-early', sessionDraftId]
    );

    // 4.4 Concert 4: REJECTED (ปฏิเสธการอนุมัติ) - UBU Electronic Beats Festival 2026
    const eventRejectedId = 'event-ubu-electronic-2026';
    const sessionRejectedId = 'session-ubu-electronic-s1';
    await client.query(
      `INSERT INTO events (
        id, "organizerId", title, description, location,
        status, "salesStartTime", "salesEndTime", "limitPerOrder",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, 'rejected', $6, $7, 4, now(), now())`,
      [
        eventRejectedId,
        organizerId,
        'UBU Electronic Beats Festival 2026',
        'เทศกาลดนตรีอิเล็กทรอนิกส์และไฟ LED กลางแจ้ง',
        'สนามกีฬา มหาวิทยาลัยอุบลราชธานี',
        new Date(now.getTime() + 2 * 86400000),
        new Date(now.getTime() + 20 * 86400000),
      ]
    );
    await client.query(
      `INSERT INTO event_sessions (
        id, "eventId", "startTime", "endTime", "admissionStartTime", "admissionEndTime",
        status, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, 'rejected', now(), now())`,
      [
        sessionRejectedId,
        eventRejectedId,
        new Date(now.getTime() + 15 * 86400000),
        new Date(now.getTime() + 15 * 86400000 + 5 * 3600000),
        new Date(now.getTime() + 15 * 86400000 - 1 * 3600000),
        new Date(now.getTime() + 15 * 86400000 + 4 * 3600000),
      ]
    );
    await client.query(
      `INSERT INTO ticket_types (id, "sessionId", name, price, quota, "isStudentPrivilege", "studentPrice", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Dance Zone', 500, 300, false, null, now(), now())`,
      ['tt-ubu-electronic-dz', sessionRejectedId]
    );

    // 4.5 Concert 5: CANCELLED (ยกเลิกคอนเสิร์ต) - UBU Campus Music Countdown 2026
    const eventCancelledId = 'event-ubu-countdown-2026';
    const sessionCancelledId = 'session-ubu-countdown-s1';
    await client.query(
      `INSERT INTO events (
        id, "organizerId", title, description, location,
        status, "salesStartTime", "salesEndTime", "limitPerOrder",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, 'cancelled', $6, $7, 4, now(), now())`,
      [
        eventCancelledId,
        organizerId,
        'UBU Campus Music Countdown 2026',
        'คอนเสิร์ตนับถอยหลังส่งท้ายปีเก่าต้อนรับปีใหม่ (ยกเลิกเนื่องจากปรับปรุงอาคาร)',
        'หอประชุมใหญ่ มหาวิทยาลัยอุบลราชธานี',
        new Date(now.getTime() - 20 * 86400000),
        new Date(now.getTime() - 5 * 86400000),
      ]
    );
    await client.query(
      `INSERT INTO event_sessions (
        id, "eventId", "startTime", "endTime", "admissionStartTime", "admissionEndTime",
        status, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, 'cancelled', now(), now())`,
      [
        sessionCancelledId,
        eventCancelledId,
        new Date(now.getTime() + 40 * 86400000),
        new Date(now.getTime() + 40 * 86400000 + 6 * 3600000),
        new Date(now.getTime() + 40 * 86400000 - 2 * 3600000),
        new Date(now.getTime() + 40 * 86400000 + 5 * 3600000),
      ]
    );
    await client.query(
      `INSERT INTO ticket_types (id, "sessionId", name, price, quota, "isStudentPrivilege", "studentPrice", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Countdown Pass', 300, 400, false, null, now(), now())`,
      ['tt-ubu-countdown-cp', sessionCancelledId]
    );

    // 5. Create News covering EVERY status (published, draft)
    console.log('Creating news covering all statuses...');
    await client.query(
      `INSERT INTO news (id, title, content, status, "authorId", "publishedAt", "createdAt", "updatedAt")
       VALUES 
       (
         'news-freshy-2026-launch',
         'เปิดจำหน่ายบัตร UBU Freshy Music Fest 2026 อย่างเป็นทางการแล้ววันนี้!',
         'สโมสรนักศึกษา มหาวิทยาลัยอุบลราชธานี ร่วมกับ TICKET ขอเชิญชวนน้องๆ นักศึกษาและบุคคลทั่วไป เข้าร่วมงานเทศกาลดนตรีครั้งยิ่งใหญ่ พร้อมพบกับศิลปินแถวหน้าของเมืองไทย ซื้อบัตรได้แล้วผ่านระบบออนไลน์',
         'published',
         $1,
         now(),
         now(),
         now()
       ),
       (
         'news-campus-guidelines',
         'ประกาศมาตรการความปลอดภัยและข้อกำหนดการเข้าชมคอนเสิร์ตภายในพื้นที่มหาวิทยาลัย',
         'เพื่อความปลอดภัยและความเป็นระเบียบเรียบร้อย ขอความร่วมมือผู้เข้าชมทุกท่านเตรียมบัตร E-Ticket พร้อมบัตรประจำตัวประชาชนหรือบัตรนักศึกษาสำหรับการตรวจสแกนหน้าประตูทางเข้างาน',
         'published',
         $1,
         now() - interval '2 days',
         now() - interval '2 days',
         now() - interval '2 days'
       ),
       (
         'news-draft-artist-lineup',
         '[ฉบับร่าง] เปิดเผยรายชื่อศิลปินรับเชิญพิเศษรอบ Final Stage เร็วๆ นี้',
         'เตรียมพบกับการประกาศไลน์อัปศิลปินชุดพิเศษที่จะมาร่วมสร้างความมันส์บนเวที UBU Freshy Music Fest 2026 ติดตามรายละเอียดได้ในเร็วๆ นี้',
         'draft',
         $1,
         null,
         now(),
         now()
       )`,
      [ownerId]
    );

    // 6. Create Web Orders & Tickets covering EVERY status (NO DIRECT QUOTA TICKETS)
    console.log('Creating web orders and tickets covering all ticket statuses (valid, admitted, refunded, cancelled)...');

    // 6.1 Order 1: PAID -> 2 tickets, status = 'valid', admissionStatus = 'outside'
    const order1Id = 'ORD-202611-0001';
    const item1Id = randomUUID();
    const ticket1AId = randomUUID();
    const ticket1BId = randomUUID();

    await client.query(
      `INSERT INTO orders (
        id, "eventId", "sessionId", "buyerEmail", "buyerName", "buyerPhone",
        status, subtotal, "discountAmount", "customerFee", total,
        "customerFeeMode", "customerFeeRate", "reservedAt", "expiresAt", "orderSource", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, 'somchai.ticket@example.com', 'สมชาย ใจดี', '0812345678',
        'paid', 700.00, 0, 20.00, 720.00, 'per_order', 20.00, now(), now() + interval '1 day', 'web', now(), now())`,
      [order1Id, eventApprovedId, sessionApprovedId]
    );
    await client.query(
      `INSERT INTO order_items (id, "orderId", "ticketTypeId", quantity, "unitPrice", subtotal)
       VALUES ($1, $2, $3, 2, 350.00, 700.00)`,
      [item1Id, order1Id, ttRegularId]
    );
    await client.query(
      `INSERT INTO tickets (id, "orderId", "orderItemId", "eventId", "sessionId", "ticketTypeId", "ticketCode", "qrPayload", price, status, "admissionStatus", "createdAt", "updatedAt")
       VALUES 
       ($1, $3, $4, $5, $6, $7, 'TK-UBU-0001', 'UBU-QR-TOKEN-0001', 350.00, 'valid', 'outside', now(), now()),
       ($2, $3, $4, $5, $6, $7, 'TK-UBU-0002', 'UBU-QR-TOKEN-0002', 350.00, 'valid', 'outside', now(), now())`,
      [ticket1AId, ticket1BId, order1Id, item1Id, eventApprovedId, sessionApprovedId, ttRegularId]
    );

    // 6.2 Order 2: PAID -> 1 ticket, status = 'valid', admissionStatus = 'inside' (สแกนเข้างานแล้ว)
    const order2Id = 'ORD-202611-0002';
    const item2Id = randomUUID();
    const ticket2Id = randomUUID();

    await client.query(
      `INSERT INTO orders (
        id, "eventId", "sessionId", "buyerEmail", "buyerName", "buyerPhone",
        status, subtotal, "discountAmount", "customerFee", total,
        "customerFeeMode", "customerFeeRate", "reservedAt", "expiresAt", "orderSource", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, 'wirat.vip@example.com', 'วิรัช กิตติศักดิ์', '0898765432',
        'paid', 800.00, 0, 20.00, 820.00, 'per_order', 20.00, now(), now() + interval '1 day', 'web', now(), now())`,
      [order2Id, eventApprovedId, sessionApprovedId]
    );
    await client.query(
      `INSERT INTO order_items (id, "orderId", "ticketTypeId", quantity, "unitPrice", subtotal)
       VALUES ($1, $2, $3, 1, 800.00, 800.00)`,
      [item2Id, order2Id, ttVipId]
    );
    await client.query(
      `INSERT INTO tickets (id, "orderId", "orderItemId", "eventId", "sessionId", "ticketTypeId", "ticketCode", "qrPayload", price, status, "admissionStatus", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'TK-UBU-VIP-001', 'UBU-QR-VIP-001', 800.00, 'valid', 'inside', now(), now())`,
      [ticket2Id, order2Id, item2Id, eventApprovedId, sessionApprovedId, ttVipId]
    );
    // Add admission log for entered ticket
    await client.query(
      `INSERT INTO ticket_admission_logs (id, "ticketId", "ticketCode", "eventId", "sessionId", "scannerId", "scannerName", action, status, "deviceMode", "createdAt")
       VALUES ($1, $2, 'TK-UBU-VIP-001', $3, $4, $5, 'จุดคัดกรองประตู 1', 'scan_in', 'success', 'online', now() - interval '1 hour')`,
      [randomUUID(), ticket2Id, eventApprovedId, sessionApprovedId, ownerId]
    );

    // 6.3 Order 3: REFUNDED -> 1 ticket, status = 'refunded'
    const order3Id = 'ORD-202611-0003';
    const item3Id = randomUUID();
    const ticket3Id = randomUUID();

    await client.query(
      `INSERT INTO orders (
        id, "eventId", "sessionId", "buyerEmail", "buyerName", "buyerPhone",
        status, subtotal, "discountAmount", "customerFee", total,
        "customerFeeMode", "customerFeeRate", "reservedAt", "expiresAt", "orderSource", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, 'malee.refund@example.com', 'มาลี รักสงบ', '0823456789',
        'refunded', 200.00, 0, 10.00, 210.00, 'per_order', 10.00, now() - interval '3 days', now() + interval '1 day', 'web', now() - interval '3 days', now() - interval '1 day')`,
      [order3Id, eventApprovedId, sessionApprovedId]
    );
    await client.query(
      `INSERT INTO order_items (id, "orderId", "ticketTypeId", quantity, "unitPrice", subtotal)
       VALUES ($1, $2, $3, 1, 200.00, 200.00)`,
      [item3Id, order3Id, ttStudentId]
    );
    await client.query(
      `INSERT INTO tickets (id, "orderId", "orderItemId", "eventId", "sessionId", "ticketTypeId", "ticketCode", "qrPayload", price, status, "admissionStatus", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'TK-UBU-STU-001', 'UBU-QR-STU-001', 200.00, 'refunded', 'outside', now() - interval '3 days', now() - interval '1 day')`,
      [ticket3Id, order3Id, item3Id, eventApprovedId, sessionApprovedId, ttStudentId]
    );
    // Add refund request record for tracking
    const refundRequestId = randomUUID();
    await client.query(
      `INSERT INTO refund_requests (id, "orderId", "buyerEmail", "buyerPhone", "buyerName", "requestedAmount", reason, status, "bankName", "bankAccountNo", "bankAccountName", "submittedAt", "reviewedAt", "reviewedByUserId", "reviewedByName")
       VALUES ($1, $2, 'malee.refund@example.com', '0823456789', 'มาลี รักสงบ', 200.00, 'ติดสอบกลางภาคไม่สามารถไปร่วมงานได้', 'completed', 'ธนาคารกสิกรไทย', '123-4-56789-0', 'น.ส. มาลี รักสงบ', now() - interval '2 days', now() - interval '1 day', $3, 'Owner')`,
      [refundRequestId, order3Id, ownerId]
    );
    await client.query(
      `INSERT INTO refund_request_items (id, "refundRequestId", "ticketId", "ticketCode", "ticketPrice")
       VALUES ($1, $2, $3, 'TK-UBU-STU-001', 200.00)`,
      [randomUUID(), refundRequestId, ticket3Id]
    );

    // 6.4 Order 4: CANCELLED -> 1 ticket, status = 'cancelled'
    const order4Id = 'ORD-202611-0004';
    const item4Id = randomUUID();
    const ticket4Id = randomUUID();

    await client.query(
      `INSERT INTO orders (
        id, "eventId", "sessionId", "buyerEmail", "buyerName", "buyerPhone",
        status, subtotal, "discountAmount", "customerFee", total,
        "customerFeeMode", "customerFeeRate", "reservedAt", "expiresAt", "orderSource", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, 'anuchit.cancel@example.com', 'อนุชิต มั่นคง', '0845678901',
        'cancelled', 350.00, 0, 20.00, 370.00, 'per_order', 20.00, now() - interval '4 days', now() - interval '3 days', 'web', now() - interval '4 days', now() - interval '3 days')`,
      [order4Id, eventApprovedId, sessionApprovedId]
    );
    await client.query(
      `INSERT INTO order_items (id, "orderId", "ticketTypeId", quantity, "unitPrice", subtotal)
       VALUES ($1, $2, $3, 1, 350.00, 350.00)`,
      [item4Id, order4Id, ttRegularId]
    );
    await client.query(
      `INSERT INTO tickets (id, "orderId", "orderItemId", "eventId", "sessionId", "ticketTypeId", "ticketCode", "qrPayload", price, status, "admissionStatus", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'TK-UBU-CAN-001', 'UBU-QR-CAN-001', 350.00, 'cancelled', 'outside', now() - interval '4 days', now() - interval '3 days')`,
      [ticket4Id, order4Id, item4Id, eventApprovedId, sessionApprovedId, ttRegularId]
    );

    // Sync ticket_type_paid_buckets for accurate quota calculation
    await client.query('TRUNCATE ticket_type_paid_buckets');
    await client.query(
      `INSERT INTO ticket_type_paid_buckets ("ticketTypeId", bucket, qty)
       SELECT oi."ticketTypeId", (hashtext(o.id) & 31)::smallint, SUM(oi.quantity)::int
       FROM order_items oi
       JOIN orders o ON o.id = oi."orderId"
       WHERE o.status = 'paid'
       GROUP BY oi."ticketTypeId", (hashtext(o.id) & 31)::smallint`
    );

    await client.query('COMMIT');
    console.log('=== DATABASE RESEED COMPLETED SUCCESSFULLY ===');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database reseed failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
