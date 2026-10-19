# ADR-0004: Owner เชิญผู้จัดงานและล็อกอินหลังบ้านด้วยรหัสผ่าน

- Status: accepted
- Date: 2026-10-19
- Source: ผู้ใช้ยืนยัน G-01=A และ G-02=A ใน grill-workflow เพื่อคลาย BQ-01 ของ SPEC-001
- Related: [Domain permissions](../../CONTEXT.md#publication-and-data-access-rules), [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Context

ระบบมี owner ที่กำกับผู้ฝากขาย และ organizer ที่เพิ่มบัญชีทีมสแกนเฉพาะงานของตนได้ตาม S1
ผู้ใช้เลือกให้ owner ควบคุมการรับ organizer ผ่านคำเชิญ และเลือกวิธีล็อกอินจากตัวเลือกที่เสนออย่างชัดเจน

## Decision

- G-01=A: Owner ส่งคำเชิญให้ organizer เท่านั้น ไม่เปิด organizer self-signup
- G-02=A: บัญชี owner, organizer และ scanner team ใช้อีเมลกับรหัสผ่าน
- มีลิงก์ตั้งรหัสผ่านใหม่ส่งทางอีเมล
- G-46=ยืนยัน (Agreed, ผู้ใช้ 2026-10-20): สร้างบัญชี owner คนแรกผ่านขั้นตอนตั้งค่าภายในระบบ ไม่มีหน้าสมัคร owner สาธารณะ; คำสั่งหรือกลไก bootstrap จริงยังไม่ได้เลือก
- คง guest checkout และ email OTP ของลูกค้าตาม CONTEXT; ข้อตกลงนี้เปลี่ยนเฉพาะ account model ของหลังบ้าน/ทีมสแกน

## Consequences and open details

ยังไม่เลือก auth library/provider หรือคำสั่ง/กลไก bootstrap จริง รูปแบบการเริ่มบัญชี owner ยืนยันตาม G-46 แล้ว
สิทธิ์ไฟล์หลักฐานยืนยันภายหลังใน [CONTEXT G-40](../../CONTEXT.md#publication-and-data-access-rules)
อายุและข้อจำกัด OTP/คำเชิญ/reset ได้รับมอบหมายภายหลังตาม G-18 และเลือกค่าด้านล่างแล้ว
ขอบเขตข้อมูลผู้ซื้อของ organizer/scanner ยืนยันภายหลังแล้วใน CONTEXT G-10/G-11
ไม่มีการสร้างบัญชี ส่งคำเชิญ หรือเปลี่ยน credentials จริงจากการบันทึก ADR นี้

## Security parameters selected under G-18 delegation

- Decision state: delegated; selected by assistant on 2026-10-19 under explicit user delegation G-18
- ตัวเลขเป็นค่าของโปรเจกต์ที่เลือกภายในขอบเขตการมอบหมาย ไม่ใช่ตัวเลขบังคับจาก OWASP หรือค่าที่ผู้ใช้ยืนยันทีละรายการ

| Concern | Selected parameter / behavior |
| --- | --- |
| Guest email OTP | รหัสสุ่ม 6 หลัก อายุ 5 นาที ใช้ได้ครั้งเดียว ผูก email/วัตถุประสงค์/คำขอที่ต้องยืนยัน |
| OTP resend | ส่งซ้ำห่างอย่างน้อย 60 วินาที สูงสุด 5 ครั้งต่อ 15 นาทีต่อ email/วัตถุประสงค์; รหัสใหม่ยกเลิกรหัสเดิม |
| OTP wrong attempts | ผิดครบ 5 ครั้งต่อ 15 นาทีต่อ email/วัตถุประสงค์ให้พักการตรวจ 15 นาที; ขอรหัสใหม่ไม่ล้างตัวนับนี้ |
| Organizer invitation | ลิงก์สุ่มใช้ครั้งเดียว อายุ 48 ชั่วโมง คำเชิญใหม่แทนที่ลิงก์เก่าของคำเชิญเดียวกัน |
| Password-reset link | ลิงก์สุ่มใช้ครั้งเดียว อายุ 30 นาที ลิงก์ใหม่แทนที่ลิงก์เดิม; ไม่ล็อกบัญชีเพียงเพราะมีผู้ขอลิงก์ |
| Reset email resend | ห่างอย่างน้อย 60 วินาที สูงสุด 3 ครั้งต่อ 15 นาทีต่อบัญชี; ข้อความตอบไม่เปิดเผยว่ามีบัญชีหรือไม่ |

โค้ด/ลิงก์ต้องสุ่มอย่างปลอดภัย เก็บในรูปที่ไม่เปิดเผยค่าลับ และตรวจวันหมดอายุ/one-time use ฝั่ง server
การจำกัดจำนวนต้องใช้ร่วมกันระหว่าง web instances ตาม ADR-0001 ไม่เลือก Redis หรือโครงสร้างบริการใหม่จากข้อนี้
เพิ่มการป้องกันการกระจายคำขอผ่านหลาย email/IP ใน implementation ตามความเสี่ยงโดยไม่ยกเลิกค่า per-email ข้างต้น
ไม่เพิ่ม MFA หรือวิธีล็อกอินใหม่ และไม่อ้างว่า email OTP เป็น phishing-resistant authentication

### Research basis

แนวทางที่ตรวจวันที่ 2026-10-19 รองรับหลักการ token ใช้ครั้งเดียว/หมดอายุ/สุ่มอย่างปลอดภัย
ข้อความตอบแบบไม่เปิดเผยบัญชี และ throttling; ไม่ได้กำหนดตัวเลขตายตัวในตารางนี้:

- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [OWASP Authentication: Login Throttling](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#login-throttling)
