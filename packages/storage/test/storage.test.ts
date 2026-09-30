import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isTenantLogoUrl,
  keyFromPublicUrl,
  presignUpload,
  readStorageConfig,
  resetStorageForTests,
  storageConfigured,
} from '../src';

const ENV_KEYS = [
  'STORAGE_ENDPOINT',
  'STORAGE_REGION',
  'STORAGE_BUCKET',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
  'STORAGE_PUBLIC_URL',
  'STORAGE_FORCE_PATH_STYLE',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_URL',
];

function setEnv(vars: Record<string, string>) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  resetStorageForTests();
}

const creds = { STORAGE_ACCESS_KEY_ID: 'AKIA_TEST', STORAGE_SECRET_ACCESS_KEY: 'secret' };

describe('readStorageConfig', () => {
  it('derives the public URL and region for AWS S3', () => {
    expect(
      readStorageConfig({ STORAGE_BUCKET: 'logos', STORAGE_REGION: 'ap-south-1', ...creds }),
    ).toMatchObject({
      endpoint: undefined,
      region: 'ap-south-1',
      publicUrl: 'https://logos.s3.ap-south-1.amazonaws.com',
    });
  });

  it('requires an explicit public URL for non-AWS endpoints', () => {
    const base = { STORAGE_BUCKET: 'logos', STORAGE_ENDPOINT: 'http://minio:9000', ...creds };
    expect(readStorageConfig(base)).toBeNull();
    expect(
      readStorageConfig({
        ...base,
        STORAGE_PUBLIC_URL: 'http://localhost:9000/logos/',
        STORAGE_FORCE_PATH_STYLE: 'true',
      }),
    ).toMatchObject({
      region: 'auto',
      forcePathStyle: true,
      publicUrl: 'http://localhost:9000/logos',
    });
  });

  it('still accepts the legacy R2_* variables', () => {
    expect(
      readStorageConfig({
        R2_ACCOUNT_ID: 'acc',
        R2_ACCESS_KEY_ID: 'k',
        R2_SECRET_ACCESS_KEY: 's',
        R2_BUCKET: 'b',
        R2_PUBLIC_URL: 'https://cdn.example.com',
      }),
    ).toMatchObject({ endpoint: 'https://acc.r2.cloudflarestorage.com', bucket: 'b' });
  });

  it('is unconfigured without credentials', () => {
    expect(readStorageConfig({ STORAGE_BUCKET: 'logos' })).toBeNull();
    expect(readStorageConfig({})).toBeNull();
  });
});

describe('public URL helpers', () => {
  beforeEach(() =>
    setEnv({ STORAGE_BUCKET: 'b', STORAGE_PUBLIC_URL: 'https://cdn.example.com', ...creds }),
  );
  afterEach(() => setEnv({}));

  it('only recognises URLs under our public base', () => {
    expect(storageConfigured()).toBe(true);
    expect(keyFromPublicUrl('https://cdn.example.com/tenant-logos/org_1/a.png')).toBe(
      'tenant-logos/org_1/a.png',
    );
    expect(keyFromPublicUrl('https://evil.example.com/tenant-logos/org_1/a.png')).toBeNull();
    expect(keyFromPublicUrl('https://cdn.example.com.evil.com/x.png')).toBeNull();
    expect(keyFromPublicUrl('https://cdn.example.com/../secret')).toBeNull();
  });

  it('scopes logos to the owning organization', () => {
    expect(isTenantLogoUrl('org_1', 'https://cdn.example.com/tenant-logos/org_1/a.png')).toBe(true);
    expect(isTenantLogoUrl('org_2', 'https://cdn.example.com/tenant-logos/org_1/a.png')).toBe(
      false,
    );
  });
});

describe('presignUpload', () => {
  afterEach(() => setEnv({}));

  it('signs content length and type without SDK checksum params (S3-compatible safe)', async () => {
    setEnv({
      STORAGE_BUCKET: 'logos',
      STORAGE_ENDPOINT: 'https://s3.us-west-000.backblazeb2.com',
      STORAGE_PUBLIC_URL: 'https://cdn.example.com',
      ...creds,
    });
    const res = await presignUpload({
      key: 'tenant-logos/org_1/x.png',
      contentType: 'image/png',
      contentLength: 1234,
    });
    const url = new URL(res.uploadUrl);
    expect(url.host).toBe('logos.s3.us-west-000.backblazeb2.com');
    const signed = url.searchParams.get('X-Amz-SignedHeaders') ?? '';
    expect(signed).toContain('content-length');
    expect(signed).toContain('content-type');
    expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false);
    expect(url.searchParams.has('x-amz-sdk-checksum-algorithm')).toBe(false);
    expect(res.publicUrl).toBe('https://cdn.example.com/tenant-logos/org_1/x.png');
  });

  it('uses path-style URLs when configured (MinIO)', async () => {
    setEnv({
      STORAGE_BUCKET: 'logos',
      STORAGE_ENDPOINT: 'http://localhost:9000',
      STORAGE_PUBLIC_URL: 'http://localhost:9000/logos',
      STORAGE_FORCE_PATH_STYLE: 'true',
      ...creds,
    });
    const res = await presignUpload({ key: 'k.png', contentType: 'image/png', contentLength: 1 });
    expect(res.uploadUrl.startsWith('http://localhost:9000/logos/k.png?')).toBe(true);
  });
});
