import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Manifest } from '@ledgerbox/contracts';
import { AppError } from '../errors.js';
import { buildAad, open, seal } from './aead.js';
import { atomicWriteFile, ensureDir, readJsonFile, writeJsonFile } from './fsutil.js';
import {
  deriveKek,
  generateDek,
  generateSalt,
  KDF_VERSION,
  unwrapDek,
  wrapDek,
  type VaultHeader,
} from './keys.js';

export const MANIFEST_SCHEMA_VERSION = 1;

export interface VaultSnapshotHandle {
  generationId: string;
  revision: number;
  blobIds: string[];
  vaultId: string;
}

export type ManifestChange = (draft: Manifest) => void;

function emptyManifest(vaultId: string): Manifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    vaultId,
    setupState: 'password_created',
    revision: 0,
    providerSettings: {
      provider: 'deepseek',
      model: 'deepseek-flash',
      keySource: 'none',
      keyMask: null,
      apiKey: null,
      updatedAt: new Date().toISOString(),
    },
    ledgers: [],
    accounts: [],
    contacts: [],
    sources: [],
    extractions: [],
    records: [],
    recordRevisions: [],
    journals: [],
    auditEvents: [],
    idempotency: [],
    lastBackupRevision: null,
  };
}

/**
 * 加密数据空间仓储。
 *
 * 磁盘布局：
 *   <dataDir>/CURRENT                     当前存储代 ID
 *   <dataDir>/vaults/<genId>/header.json  KDF 参数与包装后的 DEK
 *   <dataDir>/vaults/<genId>/manifest.enc 加密业务数据
 *   <dataDir>/vaults/<genId>/blobs/*.enc  加密附件
 *   <dataDir>/staging/                    上传与恢复的临时密文
 */
export class VaultRepository {
  private readonly dataDir: string;
  private generationId: string | null = null;
  private dek: Buffer | null = null;
  private manifestValue: Manifest | null = null;
  private header: VaultHeader | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  get isUnlocked(): boolean {
    return this.dek !== null && this.manifestValue !== null;
  }

  get manifest(): Manifest {
    if (!this.manifestValue) {
      throw new AppError('LOCKED', '数据空间已锁定，请先解锁');
    }
    return this.manifestValue;
  }

  get currentGenerationId(): string | null {
    return this.generationId;
  }

  get vaultId(): string | null {
    return this.manifestValue?.vaultId ?? this.header?.vaultId ?? null;
  }

  private get generationDir(): string {
    if (!this.generationId) {
      throw new AppError('STORAGE_LOCKED', '数据目录尚未初始化');
    }
    return join(this.dataDir, 'vaults', this.generationId);
  }

  private get blobsDir(): string {
    return join(this.generationDir, 'blobs');
  }

  /* ---------- 初始化与解锁 ---------- */

  /** 启动时恢复存储代指针，无需解密账单。 */
  async loadExisting(): Promise<void> {
    this.generationId = await this.readCurrentGeneration();
  }

  async initialize(password: string, ledgerName: string, timezone: string): Promise<void> {
    await ensureDir(this.dataDir);
    await this.acquireDirectoryLock();
    if (this.generationId || await this.readCurrentGeneration()) {
      throw new AppError('SETUP_ALREADY_DONE', '数据空间已初始化，请直接解锁');
    }

    const generationId = randomUUID();
    const genDir = join(this.dataDir, 'vaults', generationId);
    await ensureDir(genDir);
    await ensureDir(join(genDir, 'blobs'));
    await ensureDir(join(this.dataDir, 'staging'));

    const salt = generateSalt();
    const kek = await deriveKek(password, salt);
    const dek = generateDek();
    const vaultId = randomUUID();
    const header: VaultHeader = {
      formatVersion: 1,
      vaultId,
      kdf: {
        name: 'scrypt',
        version: KDF_VERSION,
        N: 131_072,
        r: 8,
        p: 1,
        salt: salt.toString('base64'),
      },
      wrappedDek: wrapDek(kek, dek),
      createdAt: new Date().toISOString(),
    };

    const manifest = emptyManifest(vaultId);
    manifest.setupState = 'password_created';
    manifest.ledgers = [
      {
        id: randomUUID(),
        name: ledgerName,
        currency: 'CNY',
        timezone,
        createdAt: new Date().toISOString(),
      },
    ];

    await writeJsonFile(join(genDir, 'header.json'), header);
    this.generationId = generationId;
    try {
      await this.writeManifestFile(manifest, dek);
    } catch (error) {
      this.generationId = null;
      throw error;
    }
    await atomicWriteFile(join(this.dataDir, 'CURRENT'), generationId, 0o600);

    this.generationId = generationId;
    this.dek = dek;
    this.header = header;
    this.manifestValue = manifest;
  }

  async unlock(password: string): Promise<Manifest> {
    const generationId = await this.readCurrentGeneration();
    if (!generationId) {
      throw new AppError('SETUP_REQUIRED', '尚未完成首次设置');
    }
    const genDir = join(this.dataDir, 'vaults', generationId);
    let header: VaultHeader;
    try {
      header = await readJsonFile<VaultHeader>(join(genDir, 'header.json'));
    } catch {
      throw new AppError('INVALID_PASSWORD_OR_BACKUP', '无法读取数据空间');
    }
    if (header.formatVersion !== 1 || header.kdf.version !== KDF_VERSION) {
      throw new AppError('UNSUPPORTED_BACKUP_VERSION', '数据空间格式版本不受支持');
    }
    const salt = Buffer.from(header.kdf.salt, 'base64');
    const kek = await deriveKek(password, salt);
    let dek: Buffer;
    try {
      dek = unwrapDek(kek, header.wrappedDek);
    } catch {
      throw new AppError('INVALID_PASSWORD_OR_BACKUP', '密码不正确');
    }
    let manifest: Manifest;
    try {
      const payload = await readFile(join(genDir, 'manifest.enc'));
      const plain = open(dek, payload, buildAad('manifest', header.vaultId));
      manifest = JSON.parse(plain.toString('utf8')) as Manifest;
    } catch {
      throw new AppError('INVALID_PASSWORD_OR_BACKUP', '数据空间校验失败');
    }

    this.generationId = generationId;
    this.dek = dek;
    this.header = header;
    this.manifestValue = manifest;
    return manifest;
  }

  lock(): void {
    this.dek = null;
    this.manifestValue = null;
    this.header = null;
  }

  private async readCurrentGeneration(): Promise<string | null> {
    try {
      const value = (await readFile(join(this.dataDir, 'CURRENT'), 'utf8')).trim();
      if (!value) throw new AppError('STORAGE_LOCKED', '数据空间指针为空，请检查存储目录');
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  /* ---------- 附件 ---------- */

  async putBlob(bytes: Buffer): Promise<string> {
    if (!this.dek) throw new AppError('LOCKED', '数据空间已锁定');
    const blobId = randomUUID();
    const payload = seal(this.dek, bytes, buildAad('blob', blobId));
    await ensureDir(this.blobsDir);
    await atomicWriteFile(join(this.blobsDir, `${blobId}.enc`), payload);
    return blobId;
  }

  async getBlob(blobId: string): Promise<Buffer> {
    if (!this.dek) throw new AppError('LOCKED', '数据空间已锁定');
    if (!/^[0-9a-f-]{36}$/.test(blobId)) {
      throw new AppError('VALIDATION_FAILED', '附件标识不合法');
    }
    try {
      const payload = await readFile(join(this.blobsDir, `${blobId}.enc`));
      return open(this.dek, payload, buildAad('blob', blobId));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('BACKUP_INTEGRITY_FAILED', '附件读取或校验失败');
    }
  }

  /* ---------- 提交 ---------- */

  /** 串行化所有持久修改。失败时内存中不保留未提交数据。 */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async commit(expectedRevision: number | null, change: ManifestChange): Promise<Manifest> {
    return this.enqueue(async () => {
      if (!this.dek || !this.manifestValue) {
        throw new AppError('LOCKED', '数据空间已锁定');
      }
      if (expectedRevision !== null && expectedRevision !== this.manifestValue.revision) {
        throw new AppError(
          'REVISION_CONFLICT',
          '数据已被其他操作更新，请重新加载后再试',
        );
      }
      const draft = structuredClone(this.manifestValue);
      change(draft);
      draft.revision = this.manifestValue.revision + 1;
      await this.writeManifestFile(draft, this.dek);
      this.manifestValue = draft;
      return draft;
    });
  }

  private async writeManifestFile(manifest: Manifest, dek: Buffer): Promise<void> {
    const payload = seal(dek, Buffer.from(JSON.stringify(manifest), 'utf8'), buildAad('manifest', manifest.vaultId));
    await atomicWriteFile(join(this.generationDir, 'manifest.enc'), payload);
  }

  /* ---------- 快照与存储代切换 ---------- */

  async snapshot(): Promise<VaultSnapshotHandle> {
    if (!this.manifestValue) throw new AppError('LOCKED', '数据空间已锁定');
    const blobIds = [...new Set(this.manifestValue.sources.map((s) => s.blobId))];
    return {
      generationId: this.generationId as string,
      revision: this.manifestValue.revision,
      blobIds,
      vaultId: this.manifestValue.vaultId,
    };
  }

  /** 恢复完成后原子切换 CURRENT。旧存储代保留，不自动删除。 */
  async activateGeneration(generationId: string): Promise<void> {
    await atomicWriteFile(join(this.dataDir, 'CURRENT'), generationId, 0o600);
    this.generationId = generationId;
  }

  generationPath(generationId: string): string {
    return join(this.dataDir, 'vaults', generationId);
  }

  async readHeader(generationId: string): Promise<VaultHeader> {
    return readJsonFile<VaultHeader>(join(this.generationPath(generationId), 'header.json'));
  }

  /** 把一个已写好的存储代直接激活并载入（恢复流程使用）。 */
  async adoptGeneration(generationId: string, password: string): Promise<Manifest> {
    await this.activateGeneration(generationId);
    return this.unlock(password);
  }

  /* ---------- 数据目录锁 ---------- */

  private lockHandle: { release: () => Promise<void> } | null = null;

  async acquireDirectoryLock(): Promise<void> {
    if (this.lockHandle) return;
    await ensureDir(this.dataDir);
    const lockPath = join(this.dataDir, '.lock');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(lockPath, `${process.pid}\n`, { flag: 'wx', mode: 0o600 });
        this.lockHandle = {
          release: async () => {
            await rm(lockPath, { force: true }).catch(() => undefined);
            this.lockHandle = null;
          },
        };
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST') throw error;
        const stale = await this.lockIsStale(lockPath);
        if (!stale) {
          throw new AppError('STORAGE_LOCKED', '数据目录正在被另一个进程使用');
        }
        await rm(lockPath, { force: true }).catch(() => undefined);
      }
    }
    throw new AppError('STORAGE_LOCKED', '数据目录正在被另一个进程使用');
  }

  async releaseDirectoryLock(): Promise<void> {
    await this.lockHandle?.release();
  }

  private async lockIsStale(lockPath: string): Promise<boolean> {
    try {
      const raw = await readFile(lockPath, 'utf8');
      const pid = Number.parseInt(raw.trim(), 10);
      if (!Number.isFinite(pid) || pid <= 0) return true;
      if (pid === process.pid) return true;
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        return true;
      }
    } catch {
      return true;
    }
  }
}
