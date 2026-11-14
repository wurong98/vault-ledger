import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import archiver from 'archiver';
import yauzl from 'yauzl';
import { AppError } from '../errors.js';
import { open, seal } from '../vault/aead.js';
import { buildAad } from '../vault/aead.js';
import { atomicWriteFile, ensureDir, readJsonFile, writeJsonFile } from '../vault/fsutil.js';
import {
  deriveKek,
  KDF_VERSION,
  unwrapDek,
  type VaultHeader,
} from '../vault/keys.js';
import type { VaultRepository } from '../vault/store.js';

const ENTRY_PATTERN = /^(backup\.json|header\.json|manifest\.enc|blobs\/[0-9a-f-]{36}\.enc)$/;

export interface BackupFileEntry {
  path: string;
  sha256: string;
  bytes: number;
}

export interface BackupDescriptor {
  formatVersion: 1;
  snapshotRevision: number;
  vaultId: string;
  createdAt: string;
  fileCount: number;
  files: BackupFileEntry[];
}

export interface BackupPreview {
  createdAt: string;
  snapshotRevision: number;
  vaultId: string;
  ledgerCount: number;
  recordCount: number;
  blobCount: number;
  sourceCount: number;
}

async function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export class BackupService {
  constructor(private readonly vault: VaultRepository) {}

  /** 生成包含全部账本的完整加密归档，写入临时文件后返回路径。 */
  async createArchive(stagingDir: string): Promise<{ path: string; descriptor: BackupDescriptor }> {
    const snapshot = await this.vault.snapshot();
    const genDir = this.vault.generationPath(snapshot.generationId);
    const descriptor: BackupDescriptor = {
      formatVersion: 1,
      snapshotRevision: snapshot.revision,
      vaultId: snapshot.vaultId,
      createdAt: new Date().toISOString(),
      fileCount: 0,
      files: [],
    };
    const files: BackupFileEntry[] = [];

    const outPath = join(stagingDir, `backup-${Date.now()}.ledgerbox`);
    await ensureDir(stagingDir);

    const output = createWriteStream(outPath, { mode: 0o600 });
    const archive = archiver('zip', { zlib: { level: 9 } });
    const finished = new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
      archive.on('warning', (warning) => {
        if (warning.code !== 'ENOENT') reject(warning);
      });
    });
    archive.pipe(output);

    const header = await this.vault.readHeader(snapshot.generationId);
    const headerBytes = await readFile(join(genDir, 'header.json'));
    const manifestBuffer = await readFile(join(genDir, 'manifest.enc'));
    const blobPaths = snapshot.blobIds.map((id) => join(genDir, 'blobs', `${id}.enc`));

    archive.append(headerBytes, { name: 'header.json' });
    archive.append(manifestBuffer, { name: 'manifest.enc' });
    for (const blobPath of blobPaths) {
      const blobId = blobPath.split('/').pop()!.replace(/\.enc$/, '');
      archive.append(createReadStream(blobPath), { name: `blobs/${blobId}.enc` });
    }

    const archived: Array<{ path: string; file: string }> = [
      { path: 'header.json', file: join(genDir, 'header.json') },
      { path: 'manifest.enc', file: join(genDir, 'manifest.enc') },
      ...blobPaths.map((blobPath) => ({
        path: `blobs/${blobPath.split('/').pop()!}`,
        file: blobPath,
      })),
    ];
    for (const entry of archived) {
      const info = await stat(entry.file);
      files.push({
        path: entry.path,
        sha256: await sha256File(entry.file),
        bytes: info.size,
      });
    }
    descriptor.files = files;
    descriptor.fileCount = files.length + 1;

    archive.append(JSON.stringify(descriptor, null, 2), { name: 'backup.json' });
    await archive.finalize();
    await finished;
    return { path: outPath, descriptor };
  }

  /** 校验备份并解压到暂存目录。不修改现有数据。 */
  async verifyAndStage(
    archivePath: string,
    stagingDir: string,
    password: string,
    maxBytes: number,
  ): Promise<{ preview: BackupPreview; stagingPath: string }> {
    const target = join(stagingDir, `restore-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await ensureDir(target);

    const extracted = await this.extractArchive(archivePath, target, maxBytes);
    const descriptor = await readJsonFile<BackupDescriptor>(join(target, 'backup.json'));
    if (descriptor.formatVersion !== 1) {
      throw new AppError('UNSUPPORTED_BACKUP_VERSION', '备份格式版本不受支持');
    }

    for (const file of descriptor.files) {
      const path = join(target, file.path);
      let actual: string;
      try {
        actual = await sha256File(path);
      } catch {
        throw new AppError('BACKUP_INTEGRITY_FAILED', '备份缺少必需文件');
      }
      if (actual !== file.sha256) {
        throw new AppError('BACKUP_INTEGRITY_FAILED', '备份文件校验失败');
      }
    }

    const header = await readJsonFile<VaultHeader>(join(target, 'header.json'));
    if (header.formatVersion !== 1 || header.kdf.version !== KDF_VERSION) {
      throw new AppError('UNSUPPORTED_BACKUP_VERSION', '备份格式版本不受支持');
    }
    const salt = Buffer.from(header.kdf.salt, 'base64');
    const kek = await deriveKek(password, salt);
    let dek: Buffer;
    try {
      dek = unwrapDek(kek, header.wrappedDek);
    } catch {
      throw new AppError('INVALID_PASSWORD_OR_BACKUP', '备份密码不正确');
    }
    let manifest;
    try {
      const payload = await readFile(join(target, 'manifest.enc'));
      const plain = open(dek, payload, buildAad('manifest', header.vaultId));
      manifest = JSON.parse(plain.toString('utf8'));
    } catch {
      throw new AppError('BACKUP_INTEGRITY_FAILED', '备份内容校验失败');
    }

    // 逐个附件认证解密，确认没有缺失或串换。
    for (const source of manifest.sources ?? []) {
      const blobPath = join(target, 'blobs', `${source.blobId}.enc`);
      try {
        const payload = await readFile(blobPath);
        open(dek, payload, buildAad('blob', source.blobId));
      } catch {
        throw new AppError('BACKUP_INTEGRITY_FAILED', '备份缺少附件或附件校验失败');
      }
    }

    const preview: BackupPreview = {
      createdAt: descriptor.createdAt,
      snapshotRevision: descriptor.snapshotRevision,
      vaultId: descriptor.vaultId,
      ledgerCount: manifest.ledgers?.length ?? 0,
      recordCount: manifest.records?.length ?? 0,
      blobCount: manifest.sources?.length ?? 0,
      sourceCount: manifest.sources?.length ?? 0,
    };
    void extracted;
    return { preview, stagingPath: target };
  }

  /** 把已校验的暂存内容写入新的存储代，并原子切换 CURRENT。 */
  async commitRestore(stagingPath: string, password: string): Promise<{ generationId: string }> {
    const generationId = `restore-${Date.now()}-${Math.random().toString(36).slice(8)}`;
    const genDir = this.vault.generationPath(generationId);
    await ensureDir(genDir);
    await ensureDir(join(genDir, 'blobs'));

    const header = await readJsonFile<VaultHeader>(join(stagingPath, 'header.json'));
    await writeJsonFile(join(genDir, 'header.json'), header);
    await atomicWriteFile(
      join(genDir, 'manifest.enc'),
      await readFile(join(stagingPath, 'manifest.enc')),
    );
    await copyBlobs(stagingPath, genDir);

    await this.vault.activateGeneration(generationId);
    await this.vault.unlock(password);
    return { generationId };
  }

  async cleanupStaging(stagingPath: string): Promise<void> {
    await rm(stagingPath, { recursive: true, force: true }).catch(() => undefined);
  }

  private extractArchive(
    archivePath: string,
    target: string,
    maxBytes: number,
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const extracted: string[] = [];
      let total = 0;
      yauzl.open(archivePath, { lazyEntries: true }, (error, zipfile) => {
        if (error || !zipfile) {
          reject(new AppError('BACKUP_INTEGRITY_FAILED', '无法读取备份文件'));
          return;
        }
        zipfile.on('entry', (entry: yauzl.Entry) => {
          const name = entry.fileName;
          if (
            !ENTRY_PATTERN.test(name) ||
            name.includes('..') ||
            name.startsWith('/') ||
            name.includes('\\')
          ) {
            reject(new AppError('BACKUP_INTEGRITY_FAILED', '备份包含非法条目'));
            zipfile.close();
            return;
          }
          if (entry.uncompressedSize > maxBytes) {
            reject(new AppError('BACKUP_TOO_LARGE', '备份内容超过上限'));
            zipfile.close();
            return;
          }
          zipfile.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) {
              reject(new AppError('BACKUP_INTEGRITY_FAILED', '备份条目读取失败'));
              zipfile.close();
              return;
            }
            total += entry.uncompressedSize;
            if (total > maxBytes) {
              reject(new AppError('BACKUP_TOO_LARGE', '备份内容超过上限'));
              zipfile.close();
              return;
            }
            const out = join(target, name);
            ensureDir(join(out, '..'))
              .then(() => {
                const writer = createWriteStream(out, { mode: 0o600 });
                stream.pipe(writer);
                writer.on('close', () => {
                  extracted.push(name);
                  zipfile.readEntry();
                });
                writer.on('error', (writerError) => {
                  reject(new AppError('BACKUP_INTEGRITY_FAILED', '备份写入失败'));
                  void writerError;
                });
              })
              .catch(() => {
                reject(new AppError('BACKUP_INTEGRITY_FAILED', '备份写入失败'));
              });
          });
        });
        zipfile.on('end', () => resolve(extracted));
        zipfile.on('error', () => {
          reject(new AppError('BACKUP_INTEGRITY_FAILED', '备份文件损坏'));
        });
        zipfile.readEntry();
      });
    });
  }
}

async function copyBlobs(stagingPath: string, genDir: string): Promise<void> {
  const { readdir } = await import('node:fs/promises');
  const blobDir = join(stagingPath, 'blobs');
  let entries: string[] = [];
  try {
    entries = await readdir(blobDir);
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    await atomicWriteFile(
      join(genDir, 'blobs', entry),
      await readFile(join(blobDir, entry)),
    );
  }
}

/** 用于测试：直接加密一段内容（暴露给同包测试使用）。 */
export function sealForTest(dek: Buffer, plain: Buffer, kind: 'manifest' | 'blob', objectId: string) {
  return seal(dek, plain, buildAad(kind, objectId));
}
