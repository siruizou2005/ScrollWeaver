/**
 * D1 数据访问层。
 *
 * 旧版 database.py 把 620 行 SQL 拼接、连接管理和业务判断混在一个类里，
 * 每个方法自己 sqlite3.connect / commit / close。这里只做数据存取，
 * 参数一律走绑定占位符（旧版有若干处 f-string 拼 SQL）。
 */

export interface User {
  id: number;
  username: string;
  email: string | null;
  created_at: number;
  last_login: number | null;
}

export interface Scroll {
  id: string;
  user_id: number;
  title: string;
  description: string;
  language: string;
  is_public: number;
  created_at: number;
  updated_at: number;
}

export interface Story {
  id: string;
  user_id: number;
  scroll_id: string;
  title: string;
  content: string;
  created_at: number;
}

export interface ChatSession {
  id: string;
  user_id: number;
  scroll_id: string;
  role_code: string;
  messages: string;
  created_at: number;
  updated_at: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

const now = () => Date.now();

export class Repo {
  constructor(private readonly db: D1Database) {}

  // ---------- 用户 ----------

  async createUser(username: string, passwordHash: string, email?: string): Promise<User> {
    const ts = now();
    const result = await this.db
      .prepare('INSERT INTO users (username, password_hash, email, created_at) VALUES (?, ?, ?, ?) RETURNING id')
      .bind(username, passwordHash, email ?? null, ts)
      .first<{ id: number }>();
    if (!result) throw new Error('创建用户失败');
    return { id: result.id, username, email: email ?? null, created_at: ts, last_login: null };
  }

  async findUserByName(username: string): Promise<(User & { password_hash: string }) | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE username = ?')
      .bind(username)
      .first<User & { password_hash: string }>();
  }

  async findUserById(id: number): Promise<User | null> {
    return this.db
      .prepare('SELECT id, username, email, created_at, last_login FROM users WHERE id = ?')
      .bind(id)
      .first<User>();
  }

  async touchLogin(id: number): Promise<void> {
    await this.db.prepare('UPDATE users SET last_login = ? WHERE id = ?').bind(now(), id).run();
  }

  // ---------- 书卷 ----------

  async listUserScrolls(userId: number): Promise<Scroll[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM scrolls WHERE user_id = ? ORDER BY updated_at DESC')
      .bind(userId)
      .all<Scroll>();
    return results ?? [];
  }

  async listPublicScrolls(): Promise<Scroll[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM scrolls WHERE is_public = 1 ORDER BY updated_at DESC LIMIT 100')
      .all<Scroll>();
    return results ?? [];
  }

  async getScroll(id: string): Promise<Scroll | null> {
    return this.db.prepare('SELECT * FROM scrolls WHERE id = ?').bind(id).first<Scroll>();
  }

  async createScroll(scroll: Omit<Scroll, 'created_at' | 'updated_at'>): Promise<Scroll> {
    const ts = now();
    await this.db
      .prepare(
        'INSERT INTO scrolls (id, user_id, title, description, language, is_public, created_at, updated_at)' +
          ' VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        scroll.id,
        scroll.user_id,
        scroll.title,
        scroll.description,
        scroll.language,
        scroll.is_public,
        ts,
        ts,
      )
      .run();
    return { ...scroll, created_at: ts, updated_at: ts };
  }

  async setScrollPublic(id: string, userId: number, isPublic: boolean): Promise<boolean> {
    const res = await this.db
      .prepare('UPDATE scrolls SET is_public = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .bind(isPublic ? 1 : 0, now(), id, userId)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  // ---------- 故事 ----------

  async listStories(userId: number): Promise<Story[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM stories WHERE user_id = ? ORDER BY created_at DESC LIMIT 100')
      .bind(userId)
      .all<Story>();
    return results ?? [];
  }

  async createStory(story: Omit<Story, 'created_at'>): Promise<Story> {
    const ts = now();
    await this.db
      .prepare(
        'INSERT INTO stories (id, user_id, scroll_id, title, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(story.id, story.user_id, story.scroll_id, story.title, story.content, ts)
      .run();
    return { ...story, created_at: ts };
  }

  async getStory(id: string): Promise<Story | null> {
    return this.db.prepare('SELECT * FROM stories WHERE id = ?').bind(id).first<Story>();
  }

  // ---------- 私语 ----------

  async createChat(
    id: string,
    userId: number,
    scrollId: string,
    roleCode: string,
  ): Promise<ChatSession> {
    const ts = now();
    await this.db
      .prepare(
        'INSERT INTO chat_sessions (id, user_id, scroll_id, role_code, messages, created_at, updated_at)' +
          " VALUES (?, ?, ?, ?, '[]', ?, ?)",
      )
      .bind(id, userId, scrollId, roleCode, ts, ts)
      .run();
    return {
      id,
      user_id: userId,
      scroll_id: scrollId,
      role_code: roleCode,
      messages: '[]',
      created_at: ts,
      updated_at: ts,
    };
  }

  async getChat(id: string): Promise<ChatSession | null> {
    return this.db.prepare('SELECT * FROM chat_sessions WHERE id = ?').bind(id).first<ChatSession>();
  }

  async saveChatMessages(id: string, messages: ChatMessage[]): Promise<void> {
    await this.db
      .prepare('UPDATE chat_sessions SET messages = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(messages), now(), id)
      .run();
  }

  async clearChat(id: string): Promise<void> {
    await this.saveChatMessages(id, []);
  }
}
