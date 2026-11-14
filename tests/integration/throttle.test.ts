import { describe, expect, it } from 'vitest';
import { AuthThrottle, COOLDOWN_LADDER_MS } from '../../apps/server/src/auth/throttle.js';

describe('密码尝试冷却', () => {
  it('前三次失败不冷却', () => {
    const throttle = new AuthThrottle('解锁密码');
    for (let i = 0; i < 3; i += 1) {
      throttle.recordFailure();
      expect(() => throttle.assertAllowed()).not.toThrow();
    }
  });

  it('第四次失败后进入 1 分钟冷却', () => {
    const throttle = new AuthThrottle('解锁密码');
    for (let i = 0; i < 3; i += 1) throttle.recordFailure();
    throttle.recordFailure();

    expect(() => throttle.assertAllowed()).toThrowError(
      expect.objectContaining({ code: 'RATE_LIMITED' }),
    );
    const status = throttle.status();
    expect(status.retryAfterSeconds).toBeGreaterThan(50);
    expect(status.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('冷却期内不累计失败次数，阶梯不提前跳级', () => {
    const throttle = new AuthThrottle('解锁密码');
    for (let i = 0; i < 4; i += 1) throttle.recordFailure();
    const levelAfterFourth = throttle.status().level;

    for (let i = 0; i < 5; i += 1) {
      expect(() => throttle.assertAllowed()).toThrow();
    }
    expect(throttle.status().level).toBe(levelAfterFourth);
    expect(throttle.status().failures).toBe(4);
  });

  it('冷却到期后放行，再失败进入下一级', () => {
    const throttle = new AuthThrottle('解锁密码');
    for (let i = 0; i < 4; i += 1) throttle.recordFailure();

    const now = Date.now();
    // 模拟冷却已过期
    expect(() => throttle.assertAllowed(now + COOLDOWN_LADDER_MS[0]! + 1000)).not.toThrow();
    throttle.recordFailure(now + COOLDOWN_LADDER_MS[0]! + 1000);

    const status = throttle.status(now + COOLDOWN_LADDER_MS[0]! + 1000);
    expect(status.retryAfterSeconds).toBeGreaterThan(60 * 59);
    expect(status.retryAfterSeconds).toBeLessThanOrEqual(60 * 60);
  });

  it('成功解锁后清零', () => {
    const throttle = new AuthThrottle('解锁密码');
    for (let i = 0; i < 4; i += 1) throttle.recordFailure();
    throttle.recordSuccess();
    expect(throttle.status().failures).toBe(0);
    expect(() => throttle.assertAllowed()).not.toThrow();
  });

  it('阶梯长度与文档一致：1 分钟/1 小时/1 天/1 周/1 月/1 年', () => {
    expect(COOLDOWN_LADDER_MS).toEqual([
      60_000,
      60 * 60_000,
      24 * 60 * 60_000,
      7 * 24 * 60 * 60_000,
      30 * 24 * 60 * 60_000,
      365 * 24 * 60 * 60_000,
    ]);
  });
});
