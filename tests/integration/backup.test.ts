import { describe, expect, it } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { VaultRepository } from '../../apps/server/src/vault/store.js';
import { LedgerService } from '../../apps/server/src/domain/ledger-service.js';
import { BackupService } from '../../apps/server/src/backup/service.js';
import { makeTempDir, removeDir } from '../helpers/mock-llm.js';

const PASSWORD = 'correct horse battery staple 2026';

async function buildVault(dir: string) {
  const vault = new VaultRepository(dir);
  await vault.initialize(PASSWORD, '个人', 'Asia/Shanghai');
  const service = new LedgerService(vault);
  const ledgerId = vault.manifest.ledgers[0]!.id;
  const account = await service.createAccount(ledgerId, '微信零钱', '微信');
  const contact = await service.createContact(ledgerId, '张三', null);
  await service.createRecord(ledgerId, {
    type: 'lend',
    amount: '500.00',
    currency: 'CNY',
    occurredOn: '2026-11-01',
    accountId: account.id,
    counterAccountId: null,
    contactId: contact.id,
    paymentMethod: '微信',
    merchant: null,
    category: null,
    remark: null,
    sourceId: null,
  });
  await service.createRecord(ledgerId, {
    type: 'repayment_received',
    amount: '200.00',
    currency: 'CNY',
    occurredOn: '2026-11-10',
    accountId: account.id,
    counterAccountId: null,
    contactId: contact.id,
    paymentMethod: null,
    merchant: null,
    category: null,
    remark: null,
    sourceId: null,
  });
  return { vault, service, ledgerId };
}

describe('备份与恢复', () => {
  it('下载的备份能在全新数据目录恢复，统计一致', async () => {
    const dirA = await makeTempDir();
    const dirB = await makeTempDir();
    try {
      const { vault, ledgerId } = await buildVault(dirA);
      const backups = new BackupService(vault);
      const staging = join(dirA, 'staging');
      const { path: archivePath, descriptor } = await backups.createArchive(staging);
      expect(descriptor.fileCount).toBeGreaterThan(1);

      const restored = new VaultRepository(dirB);
      const restoreService = new BackupService(restored);
      const { preview, stagingPath } = await restoreService.verifyAndStage(
        archivePath,
        join(dirB, 'staging'),
        PASSWORD,
        512 * 1024 * 1024,
      );
      expect(preview.ledgerCount).toBe(1);
      expect(preview.recordCount).toBe(2);

      await restoreService.commitRestore(stagingPath, PASSWORD);
      const manifest = await restored.unlock(PASSWORD);
      expect(manifest.records).toHaveLength(2);
      expect(manifest.vaultId).toBe(vault.manifest.vaultId);

      const service = new LedgerService(restored);
      expect(service.summary(ledgerId).receivable).toBe('300.00');
      expect(service.debts(ledgerId)[0]!.receivable).toBe('300.00');
    } finally {
      await removeDir(dirA);
      await removeDir(dirB);
    }
  });

  it('错误密码拒绝恢复', async () => {
    const dirA = await makeTempDir();
    const dirB = await makeTempDir();
    try {
      const { vault } = await buildVault(dirA);
      const backups = new BackupService(vault);
      const { path: archivePath } = await backups.createArchive(join(dirA, 'staging'));
      const restored = new VaultRepository(dirB);
      const restoreService = new BackupService(restored);
      await expect(
        restoreService.verifyAndStage(
          archivePath,
          join(dirB, 'staging'),
          'wrong password entirely',
          512 * 1024 * 1024,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_PASSWORD_OR_BACKUP' });
    } finally {
      await removeDir(dirA);
      await removeDir(dirB);
    }
  });

  it('备份被修改一个字节后拒绝恢复', async () => {
    const dirA = await makeTempDir();
    const dirB = await makeTempDir();
    try {
      const { vault } = await buildVault(dirA);
      const backups = new BackupService(vault);
      const { path: archivePath } = await backups.createArchive(join(dirA, 'staging'));
      const bytes = await readFile(archivePath);
      bytes[Math.floor(bytes.length / 2)] = bytes[Math.floor(bytes.length / 2)]! ^ 0xff;
      const corrupted = join(dirA, 'staging', 'corrupted.ledgerbox');
      await writeFile(corrupted, bytes);

      const restored = new VaultRepository(dirB);
      const restoreService = new BackupService(restored);
      await expect(
        restoreService.verifyAndStage(
          corrupted,
          join(dirB, 'staging'),
          PASSWORD,
          512 * 1024 * 1024,
        ),
      ).rejects.toMatchObject({
        code: expect.stringMatching(/BACKUP_INTEGRITY_FAILED|BACKUP_TOO_LARGE/),
      });
    } finally {
      await removeDir(dirA);
      await removeDir(dirB);
    }
  });

  it('拒绝包含路径穿越条目的备份', async () => {
    const dirA = await makeTempDir();
    try {
      const evil = join(dirA, 'evil.ledgerbox');
      const output = createWriteStream(evil);
      const archive = archiver('zip');
      archive.pipe(output);
      archive.append('owned', { name: '../escape.txt' });
      await archive.finalize();
      await new Promise<void>((resolve) => output.on('close', () => resolve()));

      const vault = new VaultRepository(join(dirA, 'vault'));
      await vault.initialize(PASSWORD, '个人', 'Asia/Shanghai');
      const restoreService = new BackupService(vault);
      await expect(
        restoreService.verifyAndStage(evil, join(dirA, 'staging'), PASSWORD, 1024 * 1024),
      ).rejects.toMatchObject({ code: 'BACKUP_INTEGRITY_FAILED' });
    } finally {
      await removeDir(dirA);
    }
  });
});
