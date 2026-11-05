// ตรวจ R2 จริง: put/get/delete ด้วย key ชั่วคราว ไม่พิมพ์ secret
import { R2StorageDriver, readR2Config } from '../src/server/storage-r2.ts';

const config = readR2Config();
if (!config) {
  console.error('R2 env incomplete');
  process.exit(1);
}
const driver = new R2StorageDriver(config);
const key = `healthcheck/${Date.now()}.txt`;
const body = Buffer.from('ticket r2 check');
await driver.put(key, body, 'text/plain', 'private');
const got = await driver.get(key);
if (!got?.data.equals(body) || got.contentType !== 'text/plain' || got.visibility !== 'private') {
  throw new Error('R2 get mismatch');
}
await driver.delete(key);
if ((await driver.get(key)) !== null) throw new Error('R2 delete failed');
console.log('R2 OK: put/get/delete passed on bucket', config.bucket);
