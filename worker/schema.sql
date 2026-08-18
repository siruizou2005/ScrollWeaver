-- ScrollWeaver D1 表结构
--
-- 旧版 database.py 用本地 SQLite，Workers 上没有本地磁盘，改用 D1（同样是 SQLite 方言）。
-- 与旧版的差异：
--   1. 静态内容（角色/世界观/地点）不进数据库，走 KV 内容包——旧版把系统预设书卷
--      塞进 scrolls 表，每次启动还要 init_system_scrolls() 检查一遍。
--   2. 会话状态不进数据库，存在 Durable Object 自带的存储里，跟着会话走。
--   3. 全部时间戳统一用 UTC 毫秒整数，旧版混用 isoformat 字符串与 datetime 对象。

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email         TEXT,
  created_at    INTEGER NOT NULL,
  last_login    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 用户创建的书卷。系统预设书卷不在这里，由 KV 的 index:scrolls 提供。
CREATE TABLE IF NOT EXISTS scrolls (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  language    TEXT NOT NULL DEFAULT 'zh',
  is_public   INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scrolls_user ON scrolls(user_id);
CREATE INDEX IF NOT EXISTS idx_scrolls_public ON scrolls(is_public);

-- 导出的故事
CREATE TABLE IF NOT EXISTS stories (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  scroll_id  TEXT NOT NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id);

-- 私语（一对一聊天）会话。消息体量小且需要按会话整体读取，直接存 JSON。
CREATE TABLE IF NOT EXISTS chat_sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  scroll_id  TEXT NOT NULL,
  role_code  TEXT NOT NULL,
  messages   TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_sessions(user_id);
