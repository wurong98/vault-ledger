import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { fromPayload, open, seal, toPayload, buildAad } from './aead.js';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** KDF 参数注册表。只允许使用表内参数，不接受备份内任意数值。 */
export const KDF_REGISTRY = {
  v1: { name: 'scrypt', N: 131_072, r: 8, p: 1, keylen: 32, saltBytes: 16 },
} as const;

export type KdfVersion = keyof typeof KDF_REGISTRY;

export const KDF_VERSION: KdfVersion = 'v1';

export interface VaultHeader {
  formatVersion: 1;
  /** 数据空间 ID：随备份一起恢复并保持不变。 */
  vaultId: string;
  kdf: {
    name: 'scrypt';
    version: KdfVersion;
    N: number;
    r: number;
    p: number;
    salt: string;
  };
  wrappedDek: { nonce: string; ciphertext: string; tag: string };
  createdAt: string;
}

/** scrypt 内存预算：128 * N * r 字节，留一倍余量并设上限。 */
function maxmemFor(N: number, r: number): number {
  const required = 128 * N * r;
  return Math.min(Math.max(required * 2, 64 * 1024 * 1024), 512 * 1024 * 1024);
}

export async function deriveKek(
  password: string,
  salt: Buffer,
  version: KdfVersion = KDF_VERSION,
): Promise<Buffer> {
  const params = KDF_REGISTRY[version];
  return scrypt(password, salt, params.keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: maxmemFor(params.N, params.r),
  });
}

export function generateDek(): Buffer {
  return randomBytes(32);
}

export function generateSalt(): Buffer {
  return randomBytes(KDF_REGISTRY[KDF_VERSION].saltBytes);
}

/** 用 KEK 包装 DEK。 */
export function wrapDek(kek: Buffer, dek: Buffer) {
  return toPayload(seal(kek, dek, buildAad('manifest', 'dek')));
}

export function unwrapDek(kek: Buffer, wrapped: VaultHeader['wrappedDek']): Buffer {
  return open(kek, fromPayload(wrapped), buildAad('manifest', 'dek'));
}

/** 掩码：只保留末 4 位。 */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 4) return '*'.repeat(key.length);
  return `${'*'.repeat(Math.min(8, key.length - 4))}${key.slice(-4)}`;
}
