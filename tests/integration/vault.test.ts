import { describe, expect, it } from 'vitest';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { VaultRepository } from '../../apps/server/src/vault/store.js';
import { makeTempDir, removeDir } from '../helpers/mock-llm.js';

const PASSWORD = 'correct horse battery staple 2026';

describe('加密存储', () => {
  it('初始化后可以解锁，错误密码被拒绝', async () => {
    const dir = await makeTempDir();
    try {
      const vault = new VaultRepository(dir);
      await vault.initialize(PASSWORD, '个人', 'Asia/Shanghai');
      expect(vault.isUnlocked).toBe(true);

      const reopened = new VaultRepository(dir);
      const manifest = await reopened.unlock(PASSWORD);
      expect(manifest.ledgers[0]?.name).toBe('个人');
      expect(manifest.setupState).toBe('password_created');

      const wrong = new VaultRepository(dir);
      await expect(wrong.unlock('not the right password at all')).rejects.toMatchObject({
        code: 'INVALID_PASSWORD_OR_BACKUP',
      });
    } finally {
      await removeDir(dir);
    }
  });

  it('同一数据两次加密 nonce 不同', async () => {
    const dir = await makeTempDir();
    try {
      const vault = new VaultRepository(dir);
      await vault.initialize(PASSWORD, '个人', 'Asia/Shanghai');
      const first = await vault.putBlob(Buffer.from('hello ledger'));
      const second = await vault.putBlob(Buffer.from('hello ledger'));
      expect(first).not.toBe(second);
      const a = await vault.getBlob(first);
      const b = await vault.getBlob(second);
      expect(a.toString()).toBe('hello ledger');
      expect(b.toString()).toBe('hello ledger');
    } finally {
      await removeDir(dir);
    }
  });

  it('篡改密文会被拒绝', async () => {
    const dir = await makeTempDir();
    try {
      const vault = new VaultRepository(dir);
      await vault.initialize(PASSWORD, '个人', 'Asia/Shanghai');
      const blobId = await vault.putBlob(Buffer.from('sensitive'));
      const path = join(dir, 'vaults', vault.currentGenerationId!, 'blobs', `${blobId}.enc`);
      const payload = await readFile(path);
      payload[20] = payload[20]! ^ 0xff;
      await (await import('node:fs/promises')).writeFile(path, payload);
      await expect(vault.getBlob(blobId)).rejects.toMatchObject({
        code: 'BACKUP_INTEGRITY_FAILED',
      });
    } finally {
      await removeDir(dir);
    }
  });

  it('磁盘上搜不到明文业务数据', async () => {
    const dir = await makeTempDir();
    try {
      const vault = new VaultRepository(dir);
      await vault.initialize(PASSWORD, '个人', 'Asia/Shanghai');
      await vault.putBlob(Buffer.from('张三 owes me 500'));
      const files: string[] = [];
      const walk = async (dirPath: string) => {
        for (const entry of await readdir(dirPath, { withFileTypes: true })) {
          const full = join(dirPath, entry.name);
          if (entry.isDirectory()) await walk(full);
          else files.push(full);
        }
      };
      await walk(dir);
      for (const file of files) {
        const content = await readFile(file);
        expect(content.includes('张三')).toBe(false);
        expect(content.includes('500')).toBe(false);
      }
      const manifestPath = join(dir, 'vaults', vault.currentGenerationId!, 'manifest.enc');
      expect((await stat(manifestPath)).size).toBeGreaterThan(0);
    } finally {
      await removeDir(dir);
    }
  });

  it('乐观锁冲突时拒绝提交', async () => {
    const dir = await makeTempDir();
    try {
      const vault = new VaultRepository(dir);
      await vault.initialize(PASSWORD, '个人', 'Asia/Shanghai');
      const revision = vault.manifest.revision;
      await vault.commit(revision, (draft) => {
        draft.lastBackupRevision = draft.revision;
      });
      await expect(
        vault.commit(revision, (draft) => {
          draft.lastBackupRevision = draft.revision;
        }),
      ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    } finally {
      await removeDir(dir);
    }
  });
});
