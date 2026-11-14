import { randomUUID } from 'node:crypto';
import { AppError } from '../errors.js';

export interface Session {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  /** 引导期临时会话（仅在恢复流程中使用）。 */
  bootstrap: boolean;
}

export const SESSION_COOKIE = 'lb_session';

export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly idleMs: number;

  constructor(idleMinutes: number) {
    this.idleMs = Math.max(1, idleMinutes) * 60_000;
  }

  create(bootstrap = false): Session {
    const now = Date.now();
    const session: Session = {
      id: randomUUID(),
      createdAt: now,
      lastSeenAt: now,
      bootstrap,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string | undefined): Session | null {
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session) return null;
    if (Date.now() - session.lastSeenAt > this.idleMs) {
      this.sessions.delete(id);
      return null;
    }
    session.lastSeenAt = Date.now();
    return session;
  }

  destroy(id: string | undefined): void {
    if (id) this.sessions.delete(id);
  }

  /** 锁定全部设备：撤销所有会话。 */
  destroyAll(): void {
    this.sessions.clear();
  }

  get count(): number {
    return this.sessions.size;
  }
}

export function requireSession(session: Session | null): Session {
  if (!session) {
    throw new AppError('LOCKED', '会话已失效，请重新解锁');
  }
  return session;
}
