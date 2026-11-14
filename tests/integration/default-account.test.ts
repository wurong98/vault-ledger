import { expect, it } from 'vitest';
import { VaultRepository } from '../../apps/server/src/vault/store.js';
import { LedgerService } from '../../apps/server/src/domain/ledger-service.js';
import { makeTempDir, removeDir } from '../helpers/mock-llm.js';

it('首次设置和新账本带默认账户，旧空账本补齐且不重复创建', async () => {
  const dir = await makeTempDir();
  const vault = new VaultRepository(dir);
  try {
    await vault.initialize('password123', '个人', 'Asia/Shanghai');
    const service = new LedgerService(vault);
    const first = service.listLedgers()[0]!;
    expect(service.listAccounts(first.id)).toMatchObject([{ name: '日常资金' }]);
    const next = await service.createLedger('旅行', 'Asia/Shanghai');
    expect(service.listAccounts(next.id)).toMatchObject([{ name: '日常资金' }]);
    await vault.commit(null, draft => { draft.accounts = draft.accounts.filter(a => a.ledgerId !== next.id); });
    await service.ensureDefaultAccounts();
    await service.ensureDefaultAccounts();
    expect(service.listAccounts(next.id)).toHaveLength(1);
    expect(service.listAccounts(first.id)).toHaveLength(1);
    await service.createAccount(first.id, '现金', null);
    await service.ensureDefaultAccounts();
    expect(service.listAccounts(first.id)).toHaveLength(2);
  } finally { await vault.releaseDirectoryLock(); await removeDir(dir); }
});
