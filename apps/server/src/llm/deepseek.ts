import { AppError } from '../errors.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
}

export interface ChatOptions {
  jsonMode?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface DeepSeekOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxConcurrency: number;
  getApiKey: () => string | null;
  getModel?: () => string;
}

/**
 * DeepSeek 适配器。
 *
 * 约束（见技术设计 §5）：
 * - Key 只在服务端使用，不下发浏览器；
 * - 有界并发，队列满时拒绝而不是无限排队；
 * - 失败不自动无限重试，避免重复计费；
 * - 模型没有工具能力，只能返回文本。
 */
export class DeepSeekClient {
  private running = 0;

  constructor(private readonly options: DeepSeekOptions) {}

  get model(): string {
    return this.options.getModel?.() ?? this.options.model;
  }

  private async acquire(): Promise<void> {
    if (this.running >= this.options.maxConcurrency) {
      throw new AppError('LIMIT_EXCEEDED', '模型请求已达并发上限，请稍后重试');
    }
    this.running += 1;
  }

  private release(): void {
    this.running = Math.max(0, this.running - 1);
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const apiKey = this.options.getApiKey();
    if (!apiKey) {
      throw new AppError('LLM_CONFIG_REQUIRED', '尚未配置模型 API Key');
    }
    await this.acquire();
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body: Record<string, unknown> = {
        model: this.model,
        messages,
        stream: false,
      };
      if (options.jsonMode) body.response_format = { type: 'json_object' };
      if (options.maxTokens) body.max_tokens = options.maxTokens;

      const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (response.status === 401 || response.status === 403) {
          throw new AppError('MODEL_UNAVAILABLE', '模型服务鉴权失败，请检查 API Key');
        }
        if (response.status === 429) {
          throw new AppError('RATE_LIMITED', '模型服务限流，请稍后重试');
        }
        throw new AppError(
          'MODEL_UNAVAILABLE',
          `模型服务返回错误（${response.status}）${text.slice(0, 120)}`,
        );
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new AppError('MODEL_RESPONSE_INVALID', '模型返回内容为空');
      }
      return content;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw new AppError('EXTRACTION_TIMEOUT', '模型请求超时');
      }
      throw new AppError('MODEL_UNAVAILABLE', '无法连接模型服务');
    } finally {
      clearTimeout(timer);
      this.release();
    }
  }
}

/** 从模型输出中解析 JSON，允许模型附带前后说明文字。 */
export function parseJsonLoose<T>(text: string): T | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], trimmed].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      const start = candidate.indexOf('{');
      const end = candidate.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(candidate.slice(start, end + 1)) as T;
        } catch {
          continue;
        }
      }
    }
  }
  return null;
}
