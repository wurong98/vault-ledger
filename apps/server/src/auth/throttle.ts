import { AppError } from '../errors.js';

/** 免冷却的尝试次数。 */
export const FREE_ATTEMPTS = 3;

/**
 * 冷却阶梯：前三次输错不冷却，之后逐级拉长，直到重启服务才重置。
 * 阶梯只在内存里，重启即清零 —— 这是刻意的取舍：
 * 攻击者拿到进程/文件系统权限后本就能重启进程，硬性持久化反而多一份可被篡改的状态。
 */
export const COOLDOWN_LADDER_MS = [
  60_000, // 1 分钟
  60 * 60_000, // 1 小时
  24 * 60 * 60_000, // 1 天
  7 * 24 * 60 * 60_000, // 1 周
  30 * 24 * 60 * 60_000, // 1 月（按 30 天算）
  365 * 24 * 60 * 60_000, // 1 年
] as const;

export interface ThrottleStatus {
  failures: number;
  cooldownUntil: number | null;
  retryAfterSeconds: number;
  level: number;
}

export class AuthThrottle {
  private failures = 0;
  private cooldownUntil: number | null = null;
  private level = 0;

  constructor(
    private readonly label: string,
    private readonly freeAttempts = FREE_ATTEMPTS,
    private readonly ladder: readonly number[] = COOLDOWN_LADDER_MS,
  ) {}

  /** 冷却中则拒绝本次尝试；不计入失败次数。 */
  assertAllowed(now = Date.now()): void {
    if (this.cooldownUntil === null) return;
    const remaining = this.cooldownUntil - now;
    if (remaining <= 0) {
      this.cooldownUntil = null;
      return;
    }
    const retryAfterSeconds = Math.ceil(remaining / 1000);
    throw new AppError(
      'RATE_LIMITED',
      `${this.label}尝试过于频繁，请在 ${formatDuration(remaining)}后重试`,
      undefined,
      retryAfterSeconds,
    );
  }

  /** 记录一次失败。前 freeAttempts 次不冷却，之后逐级延长。 */
  recordFailure(now = Date.now()): void {
    this.failures += 1;
    if (this.failures <= this.freeAttempts) return;
    const index = Math.min(this.level, this.ladder.length - 1);
    const duration = this.ladder[index]!;
    this.level = Math.min(this.level + 1, this.ladder.length - 1);
    this.cooldownUntil = now + duration;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.cooldownUntil = null;
    this.level = 0;
  }

  status(now = Date.now()): ThrottleStatus {
    const retryAfterSeconds =
      this.cooldownUntil === null ? 0 : Math.max(0, Math.ceil((this.cooldownUntil - now) / 1000));
    return {
      failures: this.failures,
      cooldownUntil: this.cooldownUntil,
      retryAfterSeconds,
      level: this.level,
    };
  }
}

/** 把毫秒说成人话。 */
export function formatDuration(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月`;
  const years = Math.floor(days / 365);
  if (years >= 1) return `${years} 年`;
  return `${days} 天`;
}
