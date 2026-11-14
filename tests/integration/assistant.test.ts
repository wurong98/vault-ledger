import { expect, it } from 'vitest';
import { createApp } from '../../apps/server/src/app.js';
import { loadConfig } from '../../apps/server/src/config.js';
import { makeTempDir, removeDir, startMockDeepSeek } from '../helpers/mock-llm.js';

it('统一助理支持多轮查询、保留未入账草稿和UI联系人上下文', async () => {
  const dir = await makeTempDir();
  let contactId = '';
  const mock = await startMockDeepSeek(body => {
    const system = body.messages[0].content as string;
    const latest = body.messages.at(-1).content as string;
    if (system.includes('你是账目查询意图解析器')) {
      return { content: JSON.stringify({ operation: latest.includes('上个月') ? 'sum' : 'debt_balance', filters: { contactId, type: latest.includes('上个月') ? 'lend' : null, dateFrom: latest.includes('上个月') ? '2026-10-01' : null, dateTo: latest.includes('上个月') ? '2026-10-31' : null }, supported: true }) };
    }
    return { content: JSON.stringify({ action: 'query', reply: '正在查询', queryQuestion: latest.includes('上个月') ? '杨老板上个月借出合计多少' : '杨老板还欠我多少', drafts: [] }) };
  });
  const config = loadConfig();
  const { app, context } = await createApp({ ...config, dataDir: dir, llm: { ...config.llm, baseUrl: mock.url, envApiKey: 'test' } });
  try {
    const setup = await app.inject({ method: 'POST', url: '/api/v1/setup', payload: { password: 'password123', passwordConfirmation: 'password123' } });
    const headers = { cookie: String(setup.headers['set-cookie']).split(';')[0]! };
    const ledger = context.ledger.listLedgers()[0]!;
    const account = context.ledger.listAccounts(ledger.id)[0]!;
    const contact = await context.ledger.createContact(ledger.id, '杨老板', null);
    contactId = contact.id;
    const input = { type: 'lend' as const, amount: '100.00', currency: 'CNY' as const, occurredOn: '2026-10-14', accountId: account.id, contactId, counterAccountId: null, sourceId: null, paymentMethod: '微信', merchant: null, category: null, remark: null };
    await context.ledger.createRecord(ledger.id, input);
    const drafts = [{ ...input, type: 'expense', contactId: null, amount: '28.00' }];
    const messages = [{ role: 'user', content: '他还欠我多少钱' }];
    const first = await app.inject({ method: 'POST', url: `/api/v1/ledgers/${ledger.id}/chat`, headers, payload: { messages, drafts, selectedContactId: contactId } });
    expect(first.statusCode).toBe(200);
    expect(first.json().query.debts[0]).toMatchObject({ contactName: '杨老板', receivable: '100.00' });
    expect(first.json().drafts).toEqual(drafts);
    expect(mock.requests[0]!.body.messages[0].content).toContain('UI选中的联系人');
    const second = await app.inject({ method: 'POST', url: `/api/v1/ledgers/${ledger.id}/chat`, headers, payload: { messages: [...messages, { role: 'assistant', content: '杨老板还欠你100元' }, { role: 'user', content: '那上个月借出了多少' }], drafts, selectedContactId: contactId } });
    expect(second.statusCode).toBe(200);
    expect(second.json().query.total).toBe('100.00');
    expect(second.json().drafts).toEqual(drafts);
    expect(mock.requests[2]!.body.messages.some((m: { content: string }) => m.content === '杨老板还欠你100元')).toBe(true);
    expect(context.vault.manifest.records).toHaveLength(1);
    const invalid = await app.inject({ method: 'POST', url: `/api/v1/ledgers/${ledger.id}/chat`, headers, payload: { messages, drafts, selectedContactId: 'other-ledger-contact' } });
    expect(invalid.statusCode).toBe(400);
    expect(mock.requests).toHaveLength(4);
  } finally { await app.close(); await context.vault.releaseDirectoryLock(); await mock.close(); await removeDir(dir); }
});
