import { getAuth } from '@/server/auth';
import { assertSameOrigin } from '@/server/origin';
import { validateUploadedFile } from '@/server/file-validator';
import {
  claimUploadFinalizeIntent,
  readStorageItemBounded,
  setUploadFinalizeIntentStatus,
  verifyUploadFinalizeToken,
} from '@/server/upload-finalization';
import { sanitizePublicImage } from '@/server/upload-image';
import { storage } from '@/server/storage';
import {
  MAX_FILE_SIZE,
  MAX_JSON_BODY_SIZE,
  readBoundedJson,
  releaseUploadQuota,
} from '@/server/upload-quota';
import type { Pool } from 'pg';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || (session.user.role !== 'organizer' && session.user.role !== 'owner')) {
    return Response.json({ message: 'ไม่อนุญาต' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_JSON_BODY_SIZE);
  } catch (error) {
    const status = (error as Error)?.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return Response.json({ message: 'ข้อมูลคำขอไม่ถูกต้อง' }, { status });
  }
  const token = body && typeof body === 'object' && 'token' in body && typeof body.token === 'string'
    ? body.token
    : '';
  const claims = verifyUploadFinalizeToken(token);
  if (!claims || claims.actorId !== session.user.id) {
    return Response.json({ message: 'โทเค็นยืนยันไฟล์ไม่ถูกต้องหรือหมดอายุแล้ว' }, { status: 403 });
  }
  if (claims.visibility === 'private' && session.user.role !== 'owner') {
    return Response.json({ message: 'เฉพาะผู้ดูแลระบบ (Owner) เท่านั้นที่สามารถบันทึกไฟล์หลักฐานส่วนตัวได้' }, { status: 403 });
  }

  let pool: Pool | undefined;
  try {
    pool = (auth.options as { database?: Pool }).database;
  } catch {
    // Unit and local test auth providers may not expose a database pool.
  }

  let intentClaimed = false;
  try {
    intentClaimed = await claimUploadFinalizeIntent(pool, claims);
  } catch {
    return Response.json({ message: 'ระบบยืนยันไฟล์ไม่พร้อมให้บริการชั่วคราว' }, { status: 503 });
  }
  if (!intentClaimed) {
    return Response.json({ message: 'คำขอยืนยันไฟล์นี้ถูกใช้แล้วหรือหมดอายุ' }, { status: 409 });
  }

  const rejectUpload = async (message: string, status = 400) => {
    await setUploadFinalizeIntentStatus(pool, claims.intentId, 'rejected').catch(() => {});
    await storage.delete(claims.uploadKey).catch(() => {});
    await releaseUploadQuota(pool, claims.reservationId);
    return Response.json({ message }, { status });
  };

  let item: Awaited<ReturnType<typeof readStorageItemBounded>>;
  try {
    item = await readStorageItemBounded(
      claims.uploadKey,
      Math.min(MAX_FILE_SIZE, claims.maxFileSizeBytes),
      storage,
    );
  } catch (error) {
    if ((error as Error)?.message === 'UPLOAD_TOO_LARGE') {
      return rejectUpload('ขนาดไฟล์จริงเกินขีดจำกัดที่อนุญาต', 413);
    }
    await setUploadFinalizeIntentStatus(pool, claims.intentId, 'pending').catch(() => {});
    return Response.json({ message: 'ไม่สามารถตรวจสอบไฟล์ที่อัปโหลดได้' }, { status: 502 });
  }
  if (!item) {
    await setUploadFinalizeIntentStatus(pool, claims.intentId, 'pending').catch(() => {});
    return Response.json({ message: 'ไม่พบไฟล์ที่อัปโหลด กรุณาอัปโหลดก่อนยืนยันไฟล์' }, { status: 404 });
  }
  if (item.data.byteLength === 0 || item.visibility !== claims.visibility) {
    return rejectUpload('ไฟล์ไม่ตรงกับคำขออัปโหลดที่ได้รับอนุญาต');
  }

  const filename = claims.key.split('/').pop() || 'upload';
  const validation = validateUploadedFile(item.data, claims.contentType, filename, claims.visibility);
  if (!validation.valid || validation.detectedContentType !== claims.contentType) {
    return rejectUpload(validation.error || 'เนื้อหาไฟล์จริงไม่ตรงกับประเภทที่ได้รับอนุญาต');
  }

  let finalData = item.data;
  if (claims.visibility === 'public') {
    try {
      finalData = await sanitizePublicImage(item.data, claims.contentType);
    } catch {
      return rejectUpload('ไฟล์ภาพเสียหายหรือไม่สามารถแปลงเป็นภาพที่ปลอดภัยได้');
    }
  }
  if (finalData.byteLength > claims.maxFileSizeBytes) {
    return rejectUpload('ขนาดไฟล์ที่ผ่านการตรวจสอบเกินขีดจำกัดที่จองไว้', 413);
  }

  let saved: { url: string };
  try {
    saved = await storage.put(claims.key, finalData, claims.contentType, claims.visibility);
  } catch {
    await setUploadFinalizeIntentStatus(pool, claims.intentId, 'pending').catch(() => {});
    return Response.json({ message: 'ไม่สามารถบันทึกไฟล์ที่ตรวจสอบแล้วได้' }, { status: 502 });
  }
  try {
    const markedFinalized = await setUploadFinalizeIntentStatus(pool, claims.intentId, 'finalized');
    if (!markedFinalized) throw new Error('Upload finalization state was not updated');
  } catch {
    // Leave the intent in finalizing state: the validated target already exists,
    // and replaying the signed intent must not overwrite it.
    return Response.json({ message: 'ไฟล์ได้รับการตรวจสอบแล้ว แต่ระบบยังบันทึกสถานะยืนยันไม่เสร็จ' }, { status: 503 });
  }
  await storage.delete(claims.uploadKey).catch(() => {});
  const url = claims.visibility === 'private'
    ? `/api/media/${encodeURIComponent(claims.key)}`
    : saved.url;
  return Response.json({ success: true, key: claims.key, url }, { status: 200 });
}
