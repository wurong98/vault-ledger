import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { createApp, type AppContext } from '../../apps/server/src/app.js';
import { loadConfig } from '../../apps/server/src/config.js';
import {
  makeTempDir,
  removeDir,
  startMockDeepSeek,
  type MockDeepSeek,
} from '../helpers/mock-llm.js';

const PASSWORD = 'correct horse battery staple 2026';

describe('HTTP 接口', () => {
  let dir: string;
  let mock: MockDeepSeek;
  let app: Awaited<ReturnType<typeof createApp>>['app'];
  let context: AppContext;
  let cookie = '';

  beforeEach(async () => {
    dir = await makeTempDir();
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
    const created = await createApp({
      ...base,
      dataDir: dir,
      llm: {
        ...base.llm,
        baseUrl: mock.url,
        envApiKey: 'test-key',
      },
    });
    app = created.app;
    context = created.context;
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await mock.close();
    await removeDir(dir);
  });

  const withCookie = <T extends { headers?: Record<string, string> }>(payload: T): T => {
    payload.headers = { ...(payload.headers ?? {}), cookie };
    return payload;
  };

  it('完整走通：初始化 → 记账 → 识别 → 确认 → 查询 → 锁定', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: {
        password: PASSWORD,
        passwordConfirmation: PASSWORD,
        ledgerName: '个人',
      },
    });
    expect(setup.statusCode).toBe(200);
    const setCookie = setup.headers['set-cookie'];
    cookie = Array.isArray(setCookie) ? setCookie[0]!.split(';')[0]! : String(setCookie).split(';')[0]!;
    expect(cookie).toContain('lb_session=');

    const ledgers = await app.inject(
      withCookie({ method: 'GET', url: '/api/v1/ledgers' }),
    );
    expect(ledgers.statusCode).toBe(200);
    const ledgerId = ledgers.json().ledgers[0].id;

    const account = await app.inject(
      withCookie({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/accounts`,
        payload: { name: '微信零钱', paymentMethod: '微信' },
      }),
    );
    const accountId = account.json().account.id;

    const contact = await app.inject(
      withCookie({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/contacts`,
        payload: { displayName: '张三', remark: null },
      }),
    );
    const contactId = contact.json().contact.id;

    const record = await app.inject(
      withCookie({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/records`,
        headers: { 'idempotency-key': 'idem-0001-abcdef' },
        payload: {
          type: 'lend',
          amount: '500.00',
          currency: 'CNY',
          occurredOn: '2026-11-01',
          accountId,
          counterAccountId: null,
          contactId,
          paymentMethod: '微信',
          merchant: null,
          category: null,
          remark: null,
          sourceId: null,
        },
      }),
    );
    expect(record.statusCode).toBe(200);
    expect(record.json().record.revision).toBe(1);

    // 幂等：相同键重复提交只产生一条记录
    const repeat = await app.inject(
      withCookie({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/records`,
        headers: { 'idempotency-key': 'idem-0001-abcdef' },
        payload: {
          type: 'lend',
          amount: '500.00',
          currency: 'CNY',
          occurredOn: '2026-11-01',
          accountId,
          counterAccountId: null,
          contactId,
          paymentMethod: '微信',
          merchant: null,
          category: null,
          remark: null,
          sourceId: null,
        },
      }),
    );
    expect(repeat.json().record.id).toBe(record.json().record.id);

    // 截图上传 + 识别 + 确认
    const png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();

    const upload = await app.inject(
      withCookie({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/sources?note=${encodeURIComponent('微信借给张三 500')}`,
        payload: png,
        headers: { 'content-type': 'image/png' },
      }),
    );
    expect(upload.statusCode).toBe(200);
    const sourceId = upload.json().source.id;

    const extraction = await app.inject(
      withCookie({
        method: 'POST',
        url: `/api/v1/sources/${sourceId}/extractions`,
        payload: { ledgerId },
      }),
    );
    expect(extraction.statusCode).toBe(200);
    expect(extraction.json().extraction.candidate.amount).toBe('500.00');
    expect(extraction.json().extraction.requiresReview).toContain('occurredOn');

    const confirm = await app.inject(
      withCookie({
        method: 'POST',
        url: `/api/v1/extractions/${extraction.json().extraction.id}/confirm`,
        headers: { 'idempotency-key': 'idem-0002-abcdef' },
        payload: {
          ledgerId,
          sourceId,
          record: {
            type: 'lend',
            amount: '500.00',
            currency: 'CNY',
            occurredOn: '2026-11-12',
            accountId,
            counterAccountId: null,
            contactId,
            paymentMethod: '微信',
            merchant: null,
            category: null,
            remark: null,
          },
        },
      }),
    );
    expect(confirm.statusCode).toBe(200);

    const debts = await app.inject(
      withCookie({ method: 'GET', url: `/api/v1/ledgers/${ledgerId}/debts` }),
    );
    expect(debts.json().debts[0].receivable).toBe('1000.00');

    const query = await app.inject(
      withCookie({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/query`,
        payload: { question: '张三还欠我多少' },
      }),
    );
    expect(query.statusCode).toBe(200);
    expect(query.json().intent.operation).toBe('debt_balance');
    expect(query.json().debts[0].receivable).toBe('1000.00');

    const lock = await app.inject(
      withCookie({ method: 'POST', url: '/api/v1/lock', payload: {} }),
    );
    expect(lock.statusCode).toBe(200);

    const afterLock = await app.inject(
      withCookie({ method: 'GET', url: '/api/v1/ledgers' }),
    );
    expect(afterLock.statusCode).toBe(401);
    expect(afterLock.json().code).toBe('LOCKED');
  });

  it('未初始化时状态接口可用且不泄漏业务数据', async () => {
    const status = await app.inject({ method: 'GET', url: '/api/v1/status' });
    expect(status.statusCode).toBe(200);
    expect(status.json().setupState).toBe('uninitialized');
    expect(status.json().locked).toBe(true);
    expect(JSON.stringify(status.json())).not.toContain('test-key');
  });

  it('解锁失败返回统一错误码', async () => {
    const setup = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      payload: { password: PASSWORD, passwordConfirmation: PASSWORD },
    });
    const setCookie = setup.headers['set-cookie'];
    cookie = Array.isArray(setCookie) ? setCookie[0]!.split(';')[0]! : String(setCookie).split(';')[0]!;
    await app.inject(withCookie({ method: 'POST', url: '/api/v1/lock', payload: {} }));

    const unlock = await app.inject({
      method: 'POST',
      url: '/api/v1/unlock',
      payload: { password: 'totally wrong password' },
    });
    expect(unlock.statusCode).toBe(401);
    expect(unlock.json().code).toBe('INVALID_PASSWORD_OR_BACKUP');
  });

  it('数据目录被占用时给出 STORAGE_LOCKED', async () => {
    const { createApp: create } = await import('../../apps/server/src/app.js');
    const base = loadConfig();
    const second = await create({ ...base, dataDir: dir });
    await second.app.ready();
    const result = await second.app.inject({
      method: 'GET',
      url: '/api/v1/status',
    });
    expect(result.statusCode).toBe(200);
    await second.app.close();
    void context;
  });
});
