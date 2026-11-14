import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  appOrigin: string;
  trustProxy: boolean;
  sessionIdleMinutes: number;
  llm: {
    baseUrl: string;
    model: string;
    timeoutMs: number;
    maxConcurrency: number;
    envApiKey: string | null;
  };
  limits: {
    maxImageBytes: number;
    maxImagePixels: number;
    maxBackupBytes: number;
  };
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`环境变量 ${name} 必须是正整数`);
  }
  return value;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

function expandHome(path: string): string {
  return path.startsWith('~') ? join(homedir(), path.slice(1)) : path;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = envInt('PORT', 8000);
  const dataDir = resolve(
    expandHome(process.env.DATA_DIR ?? '~/.local/share/ledgerbox'),
  );
  const appOrigin = process.env.APP_ORIGIN ?? `http://${host}:${port}`;

  const config: AppConfig = {
    host,
    port,
    dataDir,
    appOrigin,
    trustProxy: envBool('TRUST_PROXY', false),
    sessionIdleMinutes: envInt('SESSION_IDLE_MINUTES', 30),
    llm: {
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
      model: process.env.DEEPSEEK_MODEL ?? 'deepseek-flash',
      timeoutMs: envInt('LLM_TIMEOUT_MS', 120_000),
      maxConcurrency: envInt('LLM_MAX_CONCURRENCY', 2),
      envApiKey: process.env.DEEPSEEK_API_KEY?.trim() || null,
    },
    limits: {
      maxImageBytes: envInt('MAX_IMAGE_BYTES', 8 * 1024 * 1024),
      maxImagePixels: envInt('MAX_IMAGE_PIXELS', 24_000_000),
      maxBackupBytes: envInt('MAX_BACKUP_BYTES', 512 * 1024 * 1024),
    },
    ...overrides,
  };

  return config;
}

/** 可以明文出现在前端的能力开关（不含任何秘密）。 */
export function publicConfig(config: AppConfig) {
  return {
    llm: {
      provider: 'deepseek' as const,
      baseUrl: config.llm.baseUrl,
      model: config.llm.model,
      envKeyPresent: Boolean(config.llm.envApiKey),
    },
    limits: {
      maxImageBytes: config.limits.maxImageBytes,
      maxImagePixels: config.limits.maxImagePixels,
      maxBackupBytes: config.limits.maxBackupBytes,
    },
    sessionIdleMinutes: config.sessionIdleMinutes,
  };
}
