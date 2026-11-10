// ADR-0003: Cloudflare R2 driver (S3-compatible, AWS SigV4 ด้วย node:crypto ไม่เพิ่ม dependency)
import { createHash, createHmac } from 'node:crypto';
import type { PresignedUploadResult, StorageDriver, StorageItem } from './storage.ts';

export type R2Config = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
};

export function readR2Config(env: NodeJS.ProcessEnv = process.env): R2Config | null {
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BUCKET?.trim();
  let endpoint = env.R2_ENDPOINT?.trim();
  if (!endpoint && env.R2_ACCOUNT_ID?.trim()) {
    endpoint = `https://${env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`;
  }
  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) return null;
  return { accessKeyId, secretAccessKey, bucket, endpoint: endpoint.replace(/\/+$/, '') };
}

const sha256Hex = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();

function encodeKey(key: string): string {
  return key.split('/').map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
}

export class R2StorageDriver implements StorageDriver {
  private readonly config: R2Config;

  constructor(config: R2Config) {
    this.config = config;
  }

  private async request(
    method: 'PUT' | 'GET' | 'DELETE',
    key: string,
    body?: Buffer,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const { accessKeyId, secretAccessKey, bucket, endpoint } = this.config;
    const host = new URL(endpoint).host;
    const path = `/${bucket}/${encodeKey(key)}`;
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex(body ?? '');

    const signed: Record<string, string> = {
      ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()])),
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    const names = Object.keys(signed).sort();
    const canonicalHeaders = names.map((n) => `${n}:${signed[n]}\n`).join('');
    const signedHeaders = names.join(';');
    const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
    const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), 'auto'), 's3'), 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const { host: _h, ...sendHeaders } = signed;
    return fetch(`${endpoint}${path}`, {
      method,
      headers: {
        ...sendHeaders,
        Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body: body ? new Uint8Array(body) : undefined,
    });
  }

  async put(
    key: string,
    data: Uint8Array | Buffer,
    contentType: string,
    visibility: 'public' | 'private' = 'public',
  ): Promise<{ url: string; key: string }> {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const res = await this.request('PUT', key, buf, {
      'content-type': contentType,
      'x-amz-meta-visibility': visibility,
    });
    if (!res.ok) throw new Error(`R2 put failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return { url: `/api/media/${encodeURIComponent(key)}`, key };
  }

  async get(key: string): Promise<StorageItem | null> {
    const res = await this.request('GET', key);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 get failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return {
      data: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') || 'application/octet-stream',
      // metadata หายหรืออ่านไม่ได้ ให้ถือเป็น private (fail closed)
      visibility: res.headers.get('x-amz-meta-visibility') === 'public' ? 'public' : 'private',
    };
  }

  async delete(key: string): Promise<void> {
    const res = await this.request('DELETE', key);
    if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed: ${res.status}`);
  }

  async createPresignedUploadUrl(
    key: string,
    contentType: string,
    visibility: 'public' | 'private' = 'public',
    maxFileSizeBytes = 15 * 1024 * 1024,
    expiresInSeconds = 900,
  ): Promise<PresignedUploadResult> {
    const { accessKeyId, secretAccessKey, bucket, endpoint } = this.config;
    const host = new URL(endpoint).host;
    const path = `/${bucket}/${encodeKey(key)}`;
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/auto/s3/aws4_request`;

    // Strictly enforce upload file size bound via signed content-length header
    const headers: Record<string, string> = {
      'content-length': String(maxFileSizeBytes),
      'content-type': contentType,
      host,
      'x-amz-meta-visibility': visibility,
    };
    const names = Object.keys(headers).sort();
    const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join('');
    const signedHeaders = names.join(';');

    const queryParams: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${accessKeyId}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresInSeconds),
      'X-Amz-SignedHeaders': signedHeaders,
    };

    const sortedQueryKeys = Object.keys(queryParams).sort();
    const canonicalQueryString = sortedQueryKeys
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
      .join('&');

    const payloadHash = 'UNSIGNED-PAYLOAD';
    const canonicalRequest = [
      'PUT',
      path,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const kSigning = hmac(
      hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), 'auto'), 's3'),
      'aws4_request',
    );
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const uploadUrl = `${endpoint}${path}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
    const publicUrl = `/api/media/${encodeURIComponent(key)}`;

    return {
      uploadUrl,
      key,
      publicUrl,
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(maxFileSizeBytes),
        'x-amz-meta-visibility': visibility,
      },
      maxFileSizeBytes,
      expiresInSeconds,
    };
  }
}
