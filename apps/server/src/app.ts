import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import { createReadStream, createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  createLedgerSchema,
  createAccountSchema,
  createContactSchema,
  llmSettingsPatchSchema,
  queryRequestSchema,
  recordInputSchema,
  recordListQuerySchema,
  recordPatchSchema,
  setupRequestSchema,
  unlockRequestSchema,
  uploadSourceSchema,
} from '@ledgerbox/contracts';
import { AppError } from './errors.js';
import { loadConfig, publicConfig, type AppConfig } from './config.js';
import { SessionStore, SESSION_COOKIE, type Session } from './auth/session.js';
import { VaultRepository } from './vault/store.js';
import { LedgerService } from './domain/ledger-service.js';
import { SourceService } from './sources/service.js';
import { DeepSeekClient } from './llm/deepseek.js';
import { ExtractionService } from './llm/extraction.js';
import { QueryService } from './llm/query.js';
import { BackupService } from './backup/service.js';
import { maskKey } from './vault/keys.js';
import { ensureDir } from './vault/fsutil.js';

interface RestorePlan {
  id: string;
  sessionId: string;
  stagingPath: string;
  password: string;
  expectedRevision: number;
  createdAt: number;
}

interface ArchiveEntry {
  path: string;
  filename: string;
  bytes: number;
}

export interface AppContext {
  config: AppConfig;
  vault: VaultRepository;
  sessions: SessionStore;
  ledger: LedgerService;
  sources: SourceService;
  extraction: ExtractionService;
  query: QueryService;
  backups: BackupService;
  client: DeepSeekClient;
  plans: Map<string, RestorePlan>;
  archives: Map<string, ArchiveEntry>;
  stagingDir: string;
}

export async function createApp(
  overrides: Partial<AppConfig> = {},
): Promise<{ app: FastifyInstance; context: AppContext }> {
  const config = loadConfig(overrides);
  const vault = new VaultRepository(config.dataDir);
  const sessions = new SessionStore(config.sessionIdleMinutes);
  const ledger = new LedgerService(vault);
  const sources = new SourceService(vault);
  const stagingDir = join(config.dataDir, 'staging');
  await ensureDir(config.dataDir);
  await ensureDir(stagingDir);

  const client = new DeepSeekClient({
    baseUrl: config.llm.baseUrl,
    model: config.llm.model,
    timeoutMs: config.llm.timeoutMs,
    maxConcurrency: config.llm.maxConcurrency,
    getApiKey: () => {
      if (config.llm.envApiKey) return config.llm.envApiKey;
      const stored = vault.isUnlocked
        ? vault.manifest.providerSettings.apiKey
        : null;
      return stored || null;
    },
  });

  const context: AppContext = {
    config,
    vault,
    sessions,
    ledger,
    sources,
    extraction: new ExtractionService(vault, sources, client),
    query: new QueryService(ledger, client),
    backups: new BackupService(vault),
    client,
    plans: new Map(),
    archives: new Map(),
    stagingDir,
  };

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'warn',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    trustProxy: config.trustProxy,
    bodyLimit: 16 * 1024 * 1024,
  });

  await app.register(cookie, { secret: undefined });
  await app.register(multipart, { limits: { fileSize: config.limits.maxBackupBytes } });

  // 原始图片上传：不落默认临时目录，直接进内存。
  app.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'],
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );

  app.setErrorHandler((error, request, reply) => {
    const requestId = String(request.id);
    if (error instanceof AppError) {
      reply.status(error.status).send(error.toBody(requestId));
      return;
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status === 400 && typeof error === 'object' && error !== null && 'validation' in error) {
      reply.status(400).send({
        code: 'VALIDATION_FAILED',
        message: '请求格式不合法',
        requestId,
      });
      return;
    }
    request.log.error({ err: error, requestId }, 'unhandled error');
    reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: '服务内部错误',
      requestId,
    });
  });

  const webDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  let staticServed = false;
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, index: ['index.html'] });
    staticServed = true;
  }

  app.setNotFoundHandler((request, reply) => {
    if (staticServed && !request.url.startsWith('/api/')) {
      void reply.sendFile('index.html');
      return;
    }
    reply.status(404).send({
      code: 'NOT_FOUND',
      message: '接口不存在',
      requestId: String(request.id),
    });
  });

  /* ---------- 辅助 ---------- */

  const sessionOf = (request: FastifyRequest): Session | null =>
    context.sessions.get(request.cookies[SESSION_COOKIE]);

  const requireUnlocked = (request: FastifyRequest): Session => {
    const session = sessionOf(request);
    if (!session) throw new AppError('LOCKED', '会话已失效，请重新解锁');
    if (!context.vault.isUnlocked) throw new AppError('LOCKED', '数据空间已锁定，请重新解锁');
    return session;
  };

  const assertSameOrigin = (request: FastifyRequest): void => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin && origin !== config.appOrigin) {
      throw new AppError('FORBIDDEN', '跨站请求被拒绝');
    }
  };

  const setSessionCookie = (reply: { setCookie: Function }, sessionId: string): void => {
    reply.setCookie(SESSION_COOKIE, sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.appOrigin.startsWith('https://'),
      maxAge: config.sessionIdleMinutes * 60,
    });
  };

  /* ---------- 状态与引导 ---------- */

  app.get('/api/v1/status', async (request) => {
    const manifest = context.vault.isUnlocked ? context.vault.manifest : null;
    const envKey = Boolean(config.llm.envApiKey);
    const storedKey = manifest?.providerSettings.apiKey ?? null;
    const keySource = envKey ? 'env' : storedKey ? 'ui' : 'none';
    return {
      setupState:
        manifest?.setupState ??
        (context.vault.currentGenerationId ? 'password_created' : 'uninitialized'),
      locked: !context.vault.isUnlocked,
      llmConfigured: keySource !== 'none',
      llmSource: keySource,
      model: manifest?.providerSettings.model ?? config.llm.model,
      serverTime: new Date().toISOString(),
      public: publicConfig(config),
    };
  });

  app.post('/api/v1/setup', async (request, reply) => {
    assertSameOrigin(request);
    const body = setupRequestSchema.parse(request.body);
    if (body.password !== body.passwordConfirmation) {
      throw new AppError('VALIDATION_FAILED', '两次输入的密码不一致');
    }
    if (context.vault.currentGenerationId) {
      throw new AppError('SETUP_ALREADY_DONE', '数据空间已初始化，请直接解锁');
    }
    await context.vault.initialize(body.password, body.ledgerName, 'Asia/Shanghai');
    const session = context.sessions.create();
    setSessionCookie(reply, session.id);
    return { ok: true, setupState: context.vault.manifest.setupState };
  });

  app.post('/api/v1/unlock', async (request, reply) => {
    assertSameOrigin(request);
    const body = unlockRequestSchema.parse(request.body);
    const manifest = await context.vault.unlock(body.password);
    const session = context.sessions.create();
    setSessionCookie(reply, session.id);
    return { ok: true, setupState: manifest.setupState };
  });

  app.post('/api/v1/lock', async (request, reply) => {
    assertSameOrigin(request);
    context.sessions.destroy(request.cookies[SESSION_COOKIE]);
    context.vault.lock();
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/api/v1/lock-all', async (request) => {
    assertSameOrigin(request);
    requireUnlocked(request);
    context.sessions.destroyAll();
    context.vault.lock();
    return { ok: true };
  });

  /* ---------- 模型设置 ---------- */

  app.get('/api/v1/settings/llm', async (request) => {
    requireUnlocked(request);
    const settings = context.vault.manifest.providerSettings;
    const envKey = Boolean(config.llm.envApiKey);
    return {
      provider: 'deepseek',
      model: settings.model,
      keySource: envKey ? 'env' : settings.apiKey ? 'ui' : 'none',
      keyMask: envKey ? maskKey(config.llm.envApiKey as string) : settings.keyMask,
      envKeyPresent: envKey,
      updatedAt: settings.updatedAt,
    };
  });

  app.patch('/api/v1/settings/llm', async (request) => {
    assertSameOrigin(request);
    requireUnlocked(request);
    const body = llmSettingsPatchSchema.parse(request.body);
    await context.vault.commit(null, (draft) => {
      const settings = draft.providerSettings;
      if (body.model) settings.model = body.model;
      if (body.apiKey !== undefined) {
        const value = body.apiKey.trim();
        settings.apiKey = value === '' ? null : value;
        settings.keyMask = value === '' ? null : maskKey(value);
      }
      settings.keySource = config.llm.envApiKey
        ? 'env'
        : settings.apiKey
          ? 'ui'
          : 'none';
      settings.updatedAt = new Date().toISOString();
      draft.setupState =
        config.llm.envApiKey || draft.providerSettings.apiKey ? 'ready' : 'llm_config_pending';
    });
    const settings = context.vault.manifest.providerSettings;
    return {
      provider: 'deepseek',
      model: settings.model,
      keySource: config.llm.envApiKey ? 'env' : settings.apiKey ? 'ui' : 'none',
      keyMask: config.llm.envApiKey
        ? maskKey(config.llm.envApiKey as string)
        : settings.keyMask,
      envKeyPresent: Boolean(config.llm.envApiKey),
      updatedAt: settings.updatedAt,
    };
  });

  app.get('/api/v1/settings/backup', async (request) => {
    requireUnlocked(request);
    const manifest = context.vault.manifest;
    return {
      lastBackupRevision: manifest.lastBackupRevision,
      currentRevision: manifest.revision,
    };
  });

  app.post('/api/v1/settings/llm/test', async (request) => {
    assertSameOrigin(request);
    requireUnlocked(request);
    const reply = await context.client.chat(
      [
        { role: 'system', content: '只回复 OK。' },
        { role: 'user', content: '连接测试消息：ping' },
      ],
      { maxTokens: 16, timeoutMs: 20_000 },
    );
    return { ok: true, reply: reply.slice(0, 40) };
  });

  /* ---------- 账本 / 账户 / 联系人 ---------- */

  app.get('/api/v1/ledgers', async (request) => {
    requireUnlocked(request);
    return { ledgers: context.ledger.listLedgers() };
  });

  app.post('/api/v1/ledgers', async (request) => {
    assertSameOrigin(request);
    requireUnlocked(request);
    const body = createLedgerSchema.parse(request.body);
    return { ledger: await context.ledger.createLedger(body.name, body.timezone) };
  });

  app.get('/api/v1/ledgers/:id/accounts', async (request) => {
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    return { accounts: context.ledger.listAccounts(id) };
  });

  app.post('/api/v1/ledgers/:id/accounts', async (request) => {
    assertSameOrigin(request);
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    const body = createAccountSchema.parse(request.body);
    return { account: await context.ledger.createAccount(id, body.name, body.paymentMethod) };
  });

  app.get('/api/v1/ledgers/:id/contacts', async (request) => {
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    return { contacts: context.ledger.listContacts(id) };
  });

  app.post('/api/v1/ledgers/:id/contacts', async (request) => {
    assertSameOrigin(request);
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    const body = createContactSchema.parse(request.body);
    return { contact: await context.ledger.createContact(id, body.displayName, body.remark) };
  });

  app.get('/api/v1/ledgers/:id/summary', async (request) => {
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    const summary = context.ledger.summary(id);
    return { summary };
  });

  app.get('/api/v1/ledgers/:id/debts', async (request) => {
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    return { debts: context.ledger.debts(id) };
  });

  /* ---------- 来源与识别 ---------- */

  app.get('/api/v1/ledgers/:id/sources', async (request) => {
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    return { sources: context.sources.list(id) };
  });

  app.post('/api/v1/ledgers/:id/sources', async (request) => {
    assertSameOrigin(request);
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    const note = (request.query as { note?: string }).note ?? '';
    const reuseIfExists = (request.query as { reuse?: string }).reuse !== 'false';
    const buffer = request.body as Buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new AppError('VALIDATION_FAILED', '缺少图片内容');
    }
    const result = await context.sources.upload(id, buffer, note, reuseIfExists, {
      maxImageBytes: config.limits.maxImageBytes,
      maxImagePixels: config.limits.maxImagePixels,
    });
    return { source: result.source, reused: result.reused };
  });

  app.get('/api/v1/sources/:id/image', async (request, reply) => {
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    const { buffer, mimeType } = await context.sources.image(id);
    reply.header('Content-Type', mimeType);
    reply.header('Cache-Control', 'no-store');
    return reply.send(buffer);
  });

  app.post('/api/v1/sources/:id/extractions', async (request) => {
    assertSameOrigin(request);
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    const ledgerId = (request.body as { ledgerId?: string })?.ledgerId;
    if (!ledgerId) throw new AppError('VALIDATION_FAILED', '缺少账本标识');
    const extraction = await context.extraction.run(id, ledgerId);
    return { extraction };
  });

  app.get('/api/v1/extractions/:id', async (request) => {
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    return { extraction: context.extraction.get(id) };
  });

  app.post('/api/v1/extractions/:id/confirm', async (request) => {
    assertSameOrigin(request);
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    const extraction = context.extraction.get(id);
    const body = request.body as {
      ledgerId: string;
      sourceId: string;
      expectedCandidateRevision?: string;
      record: unknown;
    };
    if (!body?.ledgerId || !body?.sourceId || !body?.record) {
      throw new AppError('VALIDATION_FAILED', '缺少确认参数');
    }
    const input = recordInputSchema.parse({ ...body.record, sourceId: body.sourceId });
    const idempotencyKey = request.headers['idempotency-key'];
    const record = await context.ledger.createRecord(
      body.ledgerId,
      input,
      typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
    );
    await context.vault.commit(null, (draft) => {
      const target = draft.extractions.find((e) => e.id === extraction.id);
      if (target) target.state = 'confirmed';
    });
    return { record };
  });

  /* ---------- 记录 ---------- */

  app.get('/api/v1/ledgers/:id/records', async (request) => {
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    const query = recordListQuerySchema.parse(request.query);
    return { records: context.ledger.listRecords(id, query) };
  });

  app.post('/api/v1/ledgers/:id/records', async (request) => {
    assertSameOrigin(request);
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    const input = recordInputSchema.parse(request.body);
    const idempotencyKey = request.headers['idempotency-key'];
    const record = await context.ledger.createRecord(
      id,
      input,
      typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
    );
    return { record };
  });

  app.get('/api/v1/records/:id', async (request) => {
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    return { record: context.ledger.getRecord(id) };
  });

  app.patch('/api/v1/records/:id', async (request) => {
    assertSameOrigin(request);
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    const body = request.body as { expectedRevision?: number } & Record<string, unknown>;
    const expectedRevision = Number(body?.expectedRevision);
    if (!Number.isFinite(expectedRevision)) {
      throw new AppError('VALIDATION_FAILED', '缺少记录版本号');
    }
    const patch = recordPatchSchema.parse(body);
    return { record: await context.ledger.updateRecord(id, patch, expectedRevision) };
  });

  app.post('/api/v1/records/:id/void', async (request) => {
    assertSameOrigin(request);
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    const body = request.body as { expectedRevision?: number };
    const expectedRevision = Number(body?.expectedRevision);
    if (!Number.isFinite(expectedRevision)) {
      throw new AppError('VALIDATION_FAILED', '缺少记录版本号');
    }
    return { record: await context.ledger.voidRecord(id, expectedRevision) };
  });

  app.get('/api/v1/records/:id/history', async (request) => {
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    return context.ledger.recordHistory(id);
  });

  /* ---------- 查询 ---------- */

  app.post('/api/v1/ledgers/:id/query', async (request) => {
    assertSameOrigin(request);
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    const body = queryRequestSchema.parse(request.body);
    return context.query.ask(id, body.question);
  });

  /* ---------- 备份与恢复 ---------- */

  app.post('/api/v1/backups', async (request) => {
    assertSameOrigin(request);
    requireUnlocked(request);
    const { path, descriptor } = await context.backups.createArchive(context.stagingDir);
    const backupId = randomUUID();
    const filename = `LedgerBox-${descriptor.createdAt.replace(/[-:]/g, '').slice(0, 13).replace(/T/, '-')}-r${descriptor.snapshotRevision}.ledgerbox`;
    const { stat } = await import('node:fs/promises');
    const info = await stat(path);
    context.archives.set(backupId, { path, filename, bytes: info.size });
    await context.vault.commit(null, (draft) => {
      draft.lastBackupRevision = descriptor.snapshotRevision;
      draft.auditEvents.push({
        id: randomUUID(),
        ledgerId: null,
        action: 'backup.requested',
        targetId: backupId,
        revision: draft.revision,
        createdAt: descriptor.createdAt,
      });
    });
    return {
      backupId,
      filename,
      bytes: info.size,
      snapshotRevision: descriptor.snapshotRevision,
      currentRevision: context.vault.manifest.revision,
    };
  });

  app.get('/api/v1/backups/:id/download', async (request, reply) => {
    requireUnlocked(request);
    const { id } = request.params as { id: string };
    const entry = context.archives.get(id);
    if (!entry) throw new AppError('NOT_FOUND', '备份任务不存在，请重新生成');
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="${entry.filename}"`);
    reply.header('Cache-Control', 'no-store');
    reply.header('Content-Length', String(entry.bytes));
    await pipeline(createReadStream(entry.path), reply.raw);
    context.archives.delete(id);
    await rm(entry.path, { force: true }).catch(() => undefined);
    return reply;
  });

  app.post('/api/v1/restores/preview', async (request, reply) => {
    assertSameOrigin(request);
    const session = sessionOf(request);
    const hasVault = Boolean(context.vault.currentGenerationId);
    if (!session && hasVault) {
      throw new AppError('LOCKED', '请先解锁后再恢复');
    }
    const bootstrap = !hasVault;
    const file = await request.file();
    if (!file) throw new AppError('VALIDATION_FAILED', '缺少备份文件');
    const password = String((file.fields?.password as { value?: string })?.value ?? '');
    if (!password) throw new AppError('VALIDATION_FAILED', '缺少备份密码');

    const uploadPath = join(context.stagingDir, `upload-${Date.now()}.ledgerbox`);
    await pipeline(file.file, createWriteStream(uploadPath, { mode: 0o600 }));
    try {
      const { preview, stagingPath } = await context.backups.verifyAndStage(
        uploadPath,
        context.stagingDir,
        password,
        config.limits.maxBackupBytes,
      );
      const planId = randomUUID();
      const plan: RestorePlan = {
        id: planId,
        sessionId: session?.id ?? `bootstrap-${planId}`,
        stagingPath,
        password,
        expectedRevision: context.vault.isUnlocked ? context.vault.manifest.revision : 0,
        createdAt: Date.now(),
      };
      context.plans.set(planId, plan);
      return { planId, preview };
    } finally {
      await rm(uploadPath, { force: true }).catch(() => undefined);
    }
  });

  app.post('/api/v1/restores/:id/confirm', async (request) => {
    assertSameOrigin(request);
    const { id } = request.params as { id: string };
    const plan = context.plans.get(id);
    if (!plan) throw new AppError('NOT_FOUND', '恢复计划不存在或已过期');
    const session = sessionOf(request);
    if (session && plan.sessionId !== session.id) {
      throw new AppError('FORBIDDEN', '恢复计划属于其他会话');
    }
    if (context.vault.isUnlocked && context.vault.manifest.revision !== plan.expectedRevision) {
      throw new AppError('REVISION_CONFLICT', '预览后数据发生变化，请重新预览');
    }
    const result = await context.backups.commitRestore(plan.stagingPath, plan.password);
    context.plans.delete(id);
    context.sessions.destroyAll();
    await context.backups.cleanupStaging(plan.stagingPath);
    return { ok: true, generationId: result.generationId };
  });

  app.delete('/api/v1/restores/:id', async (request) => {
    assertSameOrigin(request);
    const { id } = request.params as { id: string };
    const plan = context.plans.get(id);
    if (!plan) return { ok: true };
    context.plans.delete(id);
    await context.backups.cleanupStaging(plan.stagingPath);
    return { ok: true };
  });

  return { app, context };
}
