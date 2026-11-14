import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { createApp } from '../../apps/server/src/app.js';
import { loadConfig } from '../../apps/server/src/config.js';
import { readFile } from 'node:fs/promises';
import {
  makeTempDir,
  removeDir,
  startMockDeepSeek,
  type MockDeepSeek,
} from '../helpers/mock-llm.js';

const PASSWORD = 'correct horse battery staple 2026';

interface LedgerRow {
  id: string;
  name: string;
}

interface RecordRow {
  id: string;
  type: string;
  amount: string;
  occurredOn: string;
  revision: number;
  status: string;
  sourceId: string | null;
}

describe('第一版验收脚本（对应实施文档 §8）', () => {
  let dirA: string;
  let dirB: string;
  let mock: MockDeepSeek;
  let appA: Awaited<ReturnType<typeof createApp>>['app'];
  let appB: Awaited<ReturnType<typeof createApp>>['app'];
  let cookieA = '';
  let cookieB = '';

  const auth = (cookie: string) => ({ cookie });

  beforeEach(async () => {
    dirA = await makeTempDir('ledgerbox-e2e-a-');
    dirB = await makeTempDir('ledgerbox-e2e-b-');
    mock = await startMockDeepSeek((body) => {
      const text = JSON.stringify(body);
      if (text.includes('"image_url"')) {
        return {
          content: JSON.stringify({
            candidate: {
              type: 'lend',
              amount: '500.00',
              currency: 'CNY',
              occurredOn: null,
              contactName: '张三',
              accountHint: '微信零钱',
              paymentMethod: '微信',
              merchant: null,
              category: null,
              remark: '月底归还',
            },
            requiresReview: [],
            evidence: [{ field: 'amount', text: '借给张三500' }],
          }),
        };
      }
      return {
        content: JSON.stringify({
          operation: 'debt_balance',
          filters: {
            contactId: null,
            dateFrom: null,
            dateTo: null,
            type: null,
            category: null,
            accountId: null,
            paymentMethod: null,
            keyword: null,
          },
          supported: true,
          clarification: null,
        }),
      };
    });

    const base = loadConfig();
    const a = await createApp({
      ...base,
      dataDir: dirA,
      llm: { ...base.llm, baseUrl: mock.url, envApiKey: 'test-key' },
    });
    const b = await createApp({
      ...base,
      dataDir: dirB,
      llm: { ...base.llm, baseUrl: mock.url, envApiKey: 'test-key' },
    });
    appA = a.app;
    appB = b.app;
    await appA.ready();
    await appB.ready();
  });

  afterEach(async () => {
    await appA.close();
    await appB.close();
    await mock.close();
    await removeDir(dirA);
    await removeDir(dirB);
  });

  it('走完 12 步验收脚本', async () => {
    /* 1. 全新数据目录进入首次引导 */
    const status = await appA.inject({ method: 'GET', url: '/api/v1/status' });
    expect(status.json().setupState).toBe('uninitialized');

    /* 2. 设置密码、配置 Key、创建「个人」账本 */
    const setup = await appA.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: {
        password: PASSWORD,
        passwordConfirmation: PASSWORD,
        ledgerName: '个人',
      },
    });
    expect(setup.statusCode).toBe(200);
    cookieA = String(setup.headers['set-cookie']).split(';')[0]!;

    const test = await appA.inject({
      method: 'POST',
      url: '/api/v1/settings/llm/test',
      payload: {},
      headers: { cookie: cookieA },
    });
    expect(test.statusCode).toBe(200);

    const ledgersA = await appA.inject({
      method: 'GET',
      url: '/api/v1/ledgers',
      headers: auth(cookieA),
    });
    const personal = ledgersA.json().ledgers[0] as LedgerRow;
    expect(personal.name).toBe('个人');

    const account = (
      await appA.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${personal.id}/accounts`,
        headers: auth(cookieA),
        payload: { name: '微信零钱', paymentMethod: '微信' },
      })
    ).json().account;
    const contact = (
      await appA.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${personal.id}/contacts`,
        headers: auth(cookieA),
        payload: { displayName: '张三', remark: null },
      })
    ).json().contact;

    /* 3. 上传虚构借款截图 → 识别 → 确认 */
    const png = await sharp({
      create: { width: 64, height: 128, channels: 3, background: '#eeeeee' },
    })
      .png()
      .toBuffer();

    const upload = await appA.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${personal.id}/sources?note=${encodeURIComponent('微信借给张三 500')}`,
      headers: { ...auth(cookieA), 'content-type': 'image/png' },
      payload: png,
    });
    expect(upload.statusCode).toBe(200);
    const sourceId = upload.json().source.id as string;

    const extraction = (
      await appA.inject({
        method: 'POST',
        url: `/api/v1/sources/${sourceId}/extractions`,
        headers: auth(cookieA),
        payload: { ledgerId: personal.id },
      })
    ).json().extraction;

    const confirmed = (
      await appA.inject({
        method: 'POST',
        url: `/api/v1/extractions/${extraction.id}/confirm`,
        headers: { ...auth(cookieA), 'idempotency-key': 'e2e-confirm-0001' },
        payload: {
          ledgerId: personal.id,
          sourceId,
          record: {
            type: 'lend',
            amount: '500.00',
            currency: 'CNY',
            occurredOn: '2026-11-01',
            accountId: account.id,
            contactId: contact.id,
            paymentMethod: '微信',
            remark: '月底归还',
          },
        },
      })
    ).json().record as RecordRow;
    expect(confirmed.amount).toBe('500.00');

    /* 4. 再记「张三归还 200」，应收 300，日常收支不受影响 */
    const repaid = (
      await appA.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${personal.id}/records`,
        headers: { ...auth(cookieA), 'idempotency-key': 'e2e-record-0002' },
        payload: {
          type: 'repayment_received',
          amount: '200.00',
          currency: 'CNY',
          occurredOn: '2026-11-10',
          accountId: account.id,
          contactId: contact.id,
          paymentMethod: '微信',
        },
      })
    ).json().record as RecordRow;

    const summary = (
      await appA.inject({
        method: 'GET',
        url: `/api/v1/ledgers/${personal.id}/summary`,
        headers: auth(cookieA),
      })
    ).json().summary;
    expect(summary.receivable).toBe('300.00');
    expect(summary.income).toBe('0.00');
    expect(summary.expense).toBe('0.00');

    /* 5. 问「张三还欠我多少」→ 300，展示来源记录 */
    const query = await appA.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${personal.id}/query`,
      headers: auth(cookieA),
      payload: { question: '张三还欠我多少' },
    });
    expect(query.statusCode).toBe(200);
    expect(query.json().debts[0].receivable).toBe('300.00');
    expect(query.json().intent.operation).toBe('debt_balance');

    /* 6. 修订借出 500 → 600，应收 400，历史仍能看到 500 */
    const revised = (
      await appA.inject({
        method: 'PATCH',
        url: `/api/v1/records/${confirmed.id}`,
        headers: auth(cookieA),
        payload: {
          expectedRevision: confirmed.revision,
          amount: '600.00',
          reason: '金额记错',
        },
      })
    ).json().record as RecordRow;
    expect(revised.amount).toBe('600.00');

    const debtsAfter = (
      await appA.inject({
        method: 'GET',
        url: `/api/v1/ledgers/${personal.id}/debts`,
        headers: auth(cookieA),
      })
    ).json().debts;
    expect(debtsAfter[0].receivable).toBe('400.00');

    const history = (
      await appA.inject({
        method: 'GET',
        url: `/api/v1/records/${confirmed.id}/history`,
        headers: auth(cookieA),
      })
    ).json();
    expect(history.revisions).toHaveLength(1);
    expect(history.revisions[0].previousRevision).toBe(1);

    /* 7. 第二个账本，切换后互不影响 */
    const family = (
      await appA.inject({
        method: 'POST',
        url: '/api/v1/ledgers',
        headers: auth(cookieA),
        payload: { name: '家庭', timezone: 'Asia/Shanghai' },
      })
    ).json().ledger as LedgerRow;
    const familyRecords = (
      await appA.inject({
        method: 'GET',
        url: `/api/v1/ledgers/${family.id}/records`,
        headers: auth(cookieA),
      })
    ).json().records as RecordRow[];
    expect(familyRecords).toHaveLength(0);

    /* 8. 详情可以打开完整原图，字节一致 */
    const image = await appA.inject({
      method: 'GET',
      url: `/api/v1/sources/${sourceId}/image`,
      headers: auth(cookieA),
    });
    expect(image.statusCode).toBe(200);
    expect(Buffer.compare(image.rawPayload, png)).toBe(0);

    /* 9. 下载加密备份 */
    const backup = (
      await appA.inject({
        method: 'POST',
        url: '/api/v1/backups',
        headers: auth(cookieA),
        payload: {},
      })
    ).json();
    expect(backup.filename).toMatch(/^LedgerBox-.*\.ledgerbox$/);
    const downloaded = await appA.inject({
      method: 'GET',
      url: `/api/v1/backups/${backup.backupId}/download`,
      headers: auth(cookieA),
    });
    expect(downloaded.statusCode).toBe(200);
    const archiveBytes = downloaded.rawPayload;
    expect(archiveBytes.length).toBeGreaterThan(0);

    /* 10. 在另一个空数据目录恢复 */
    const form = new FormData();
    form.append('password', PASSWORD);
    form.append(
      'file',
      new Blob([new Uint8Array(archiveBytes)], { type: 'application/octet-stream' }),
      'backup.ledgerbox',
    );
    const preview = await appB.inject({
      method: 'POST',
      url: '/api/v1/restores/preview',
      headers: auth(cookieB),
      payload: form,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().preview.ledgerCount).toBe(2);
    expect(preview.json().preview.recordCount).toBe(2);

    const confirm = await appB.inject({
      method: 'POST',
      url: `/api/v1/restores/${preview.json().planId}/confirm`,
      headers: auth(cookieB),
      payload: {},
    });
    expect(confirm.statusCode).toBe(200);

    /* 11. 恢复后重新解锁，数据与统计一致 */
    const unlock = await appB.inject({
      method: 'POST',
      url: '/api/v1/unlock',
      payload: { password: PASSWORD },
    });
    expect(unlock.statusCode).toBe(200);
    cookieB = String(unlock.headers['set-cookie']).split(';')[0]!;

    const restoredLedgers = (
      await appB.inject({
        method: 'GET',
        url: '/api/v1/ledgers',
        headers: auth(cookieB),
      })
    ).json().ledgers as LedgerRow[];
    expect(restoredLedgers).toHaveLength(2);

    const restoredPersonal = restoredLedgers.find((l) => l.name === '个人')!;
    const restoredSummary = (
      await appB.inject({
        method: 'GET',
        url: `/api/v1/ledgers/${restoredPersonal.id}/summary`,
        headers: auth(cookieB),
      })
    ).json().summary;
    expect(restoredSummary.receivable).toBe('400.00');

    const restoredContacts = (
      await appB.inject({
        method: 'GET',
        url: `/api/v1/ledgers/${restoredPersonal.id}/contacts`,
        headers: auth(cookieB),
      })
    ).json().contacts;
    expect(restoredContacts[0].displayName).toBe('张三');

    const restoredSources = (
      await appB.inject({
        method: 'GET',
        url: `/api/v1/ledgers/${restoredPersonal.id}/sources`,
        headers: auth(cookieB),
      })
    ).json().sources;
    expect(restoredSources).toHaveLength(1);
    const restoredImage = await appB.inject({
      method: 'GET',
      url: `/api/v1/sources/${restoredSources[0].id}/image`,
      headers: auth(cookieB),
    });
    expect(Buffer.compare(restoredImage.rawPayload, png)).toBe(0);

    const llmSettings = (
      await appB.inject({
        method: 'GET',
        url: '/api/v1/settings/llm',
        headers: auth(cookieB),
      })
    ).json();
    expect(llmSettings.model).toBe('deepseek-flash');
    expect(llmSettings.envKeyPresent).toBe(true);

    /* 12. 修改备份一个字节后必须拒绝，且不影响已恢复的数据 */
    const corrupted = Buffer.from(archiveBytes);
    corrupted[Math.floor(corrupted.length / 2)] ^= 0xff;
    const badForm = new FormData();
    badForm.append('password', PASSWORD);
    badForm.append(
      'file',
      new Blob([new Uint8Array(corrupted)], { type: 'application/octet-stream' }),
      'corrupt.ledgerbox',
    );
    const rejected = await appB.inject({
      method: 'POST',
      url: '/api/v1/restores/preview',
      headers: auth(cookieB),
      payload: badForm,
    });
    expect(rejected.statusCode).toBeGreaterThanOrEqual(400);
    expect(rejected.json().code).toMatch(/BACKUP_INTEGRITY_FAILED|BACKUP_TOO_LARGE/);

    const stillThere = (
      await appB.inject({
        method: 'GET',
        url: `/api/v1/ledgers/${restoredPersonal.id}/summary`,
        headers: auth(cookieB),
      })
    ).json().summary;
    expect(stillThere.receivable).toBe('400.00');

    void repaid;
    void readFile;
  });
});
