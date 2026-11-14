import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Source } from '@ledgerbox/contracts';
import { AppError } from '../errors.js';
import type { VaultRepository } from '../vault/store.js';

const ALLOWED = new Map([
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
]);

export interface ImageInfo {
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
}

/** 按真实内容校验图片：不信任扩展名与 MIME 声明。 */
export async function validateImage(
  buffer: Buffer,
  limits: { maxImageBytes: number; maxImagePixels: number },
): Promise<ImageInfo> {
  if (buffer.byteLength === 0) {
    throw new AppError('VALIDATION_FAILED', '图片内容为空');
  }
  if (buffer.byteLength > limits.maxImageBytes) {
    throw new AppError(
      'LIMIT_EXCEEDED',
      `图片超过 ${Math.floor(limits.maxImageBytes / 1024 / 1024)} MiB 上限`,
    );
  }
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { limitInputPixels: limits.maxImagePixels }).metadata();
  } catch {
    throw new AppError('VALIDATION_FAILED', '无法解析图片内容');
  }
  const mimeType = meta.format ? ALLOWED.get(meta.format) : undefined;
  if (!mimeType) {
    throw new AppError('VALIDATION_FAILED', '仅支持 JPEG、PNG、WebP 图片');
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width === 0 || height === 0) {
    throw new AppError('VALIDATION_FAILED', '图片尺寸无效');
  }
  if (width * height > limits.maxImagePixels) {
    throw new AppError('LIMIT_EXCEEDED', '图片像素数超过上限');
  }
  if (width > 8192 || height > 8192) {
    throw new AppError('LIMIT_EXCEEDED', '图片边长超过 8192 像素');
  }
  return { mimeType, width, height, bytes: buffer.byteLength };
}

export class SourceService {
  constructor(private readonly vault: VaultRepository) {}

  async upload(
    ledgerId: string,
    buffer: Buffer,
    note: string,
    reuseIfExists: boolean,
    limits: { maxImageBytes: number; maxImagePixels: number },
  ): Promise<{ source: Source; reused: boolean }> {
    const info = await validateImage(buffer, limits);
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    if (reuseIfExists) {
      const existing = this.vault.manifest.sources.find(
        (s) => s.ledgerId === ledgerId && s.sha256 === sha256,
      );
      if (existing) {
        if (note && note !== existing.note) {
          await this.vault.commit(null, (draft) => {
            const target = draft.sources.find((s) => s.id === existing.id);
            if (target) target.note = note;
          });
          return { source: { ...existing, note }, reused: true };
        }
        return { source: existing, reused: true };
      }
    }

    const blobId = await this.vault.putBlob(buffer);
    const source: Source = {
      id: randomUUID(),
      ledgerId,
      sha256,
      mimeType: info.mimeType,
      blobId,
      note,
      createdAt: new Date().toISOString(),
    };
    await this.vault.commit(null, (draft) => {
      draft.sources.push(source);
      draft.auditEvents.push({
        id: randomUUID(),
        ledgerId,
        action: 'source.upload',
        targetId: source.id,
        revision: draft.revision,
        createdAt: source.createdAt,
      });
    });
    return { source, reused: false };
  }

  list(ledgerId: string): Source[] {
    return this.vault.manifest.sources.filter((s) => s.ledgerId === ledgerId);
  }

  require(sourceId: string): Source {
    const source = this.vault.manifest.sources.find((s) => s.id === sourceId);
    if (!source) throw new AppError('NOT_FOUND', '来源不存在');
    return source;
  }

  async image(sourceId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const source = this.require(sourceId);
    const buffer = await this.vault.getBlob(source.blobId);
    return { buffer, mimeType: source.mimeType };
  }
}
