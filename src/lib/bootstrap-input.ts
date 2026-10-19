export const minimumPasswordLength = 15;
export const maximumPasswordLength = 128;
export type BootstrapInput = { email: string; name: string; password: string };

export function validateBootstrapInput(value: unknown): BootstrapInput {
  if (!value || typeof value !== 'object') throw new Error('ข้อมูลบัญชีไม่ครบ');
  const data = value as Record<string, unknown>;
  if (typeof data.email !== 'string' || typeof data.name !== 'string' || typeof data.password !== 'string') {
    throw new Error('ข้อมูลบัญชีไม่ครบ');
  }
  const email = data.email.trim().toLowerCase();
  const name = data.name.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('อีเมลไม่ถูกต้อง');
  if (!name || name.length > 100) throw new Error('ชื่อต้องมีความยาว 1–100 ตัวอักษร');
  if (data.password.length < minimumPasswordLength || data.password.length > maximumPasswordLength) {
    throw new Error('รหัสผ่านต้องมีความยาว 15–128 ตัวอักษร');
  }
  return { email, name, password: data.password };
}
