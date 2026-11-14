import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AAD 绑定格式版本、对象类型与对象 ID。
 *
 * 刻意不包含数据空间 ID：备份恢复会在新的存储代落盘，如果 AAD 绑定数据空间
 * ID，恢复后所有既有密文的认证都会失败。对象 ID 为随机值，足以防止密文串换。
 */
export function buildAad(kind: 'manifest' | 'blob', objectId: string): Buffer {
  return Buffer.from(`ledgerbox:v1:${kind}:${objectId}`, 'utf8');
}

export interface AeadPayload {
  nonce: string;
  ciphertext: string;
  tag: string;
}

/** 加密。输出为 nonce(12) || ciphertext || tag(16) 的二进制形式。 */
export function seal(
  key: Buffer,
  plaintext: Buffer,
  aad: Buffer,
): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGO, key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, ciphertext, tag]);
}

/** 解密并校验认证标签。标签不匹配时抛错，调用方不得使用任何明文。 */
export function open(key: Buffer, payload: Buffer, aad: Buffer): Buffer {
  if (payload.length < NONCE_BYTES + TAG_BYTES) {
    throw new Error('密文长度不足');
  }
  const nonce = payload.subarray(0, NONCE_BYTES);
  const tag = payload.subarray(payload.length - TAG_BYTES);
  const ciphertext = payload.subarray(NONCE_BYTES, payload.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function toPayload(buffer: Buffer): AeadPayload {
  const nonce = buffer.subarray(0, NONCE_BYTES).toString('base64');
  const tag = buffer.subarray(buffer.length - TAG_BYTES).toString('base64');
  const ciphertext = buffer
    .subarray(NONCE_BYTES, buffer.length - TAG_BYTES)
    .toString('base64');
  return { nonce, ciphertext, tag };
}

export function fromPayload(payload: AeadPayload): Buffer {
  return Buffer.concat([
    Buffer.from(payload.nonce, 'base64'),
    Buffer.from(payload.ciphertext, 'base64'),
    Buffer.from(payload.tag, 'base64'),
  ]);
}
