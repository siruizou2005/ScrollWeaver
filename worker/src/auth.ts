/**
 * 认证：口令哈希与 JWT。
 *
 * Workers 里没有 bcrypt（原生模块），用 Web Crypto 的 PBKDF2-SHA256 代替；
 * JWT 也用 Web Crypto 的 HMAC 手写，避免为了签个 token 引入依赖撑大包体积。
 *
 * 与旧版的差异：旧版把 token 存进 user_tokens 表并每次查库校验，
 * 这里用自校验的签名 token，省掉登录态的数据库往返。
 */

const PBKDF2_ITERATIONS = 100_000;
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** 恒定时间比较，避免比较早退泄漏信息。 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

// ---------- 口令 ----------

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number.parseInt(parts[1] as string, 10);
  const salt = fromBase64Url(parts[2] as string);
  const expected = fromBase64Url(parts[3] as string);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    expected.length * 8,
  );
  return timingSafeEqual(new Uint8Array(bits), expected);
}

// ---------- JWT ----------

export interface TokenPayload {
  sub: number;
  username: string;
  exp: number;
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signToken(
  secret: string,
  user: { id: number; username: string },
): Promise<string> {
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload: TokenPayload = {
    sub: user.id,
    username: user.username,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(data));
  return `${data}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifyToken(secret: string, token: string): Promise<TokenPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];

  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    fromBase64Url(sig),
    encoder.encode(`${header}.${body}`),
  );
  if (!valid) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as TokenPayload;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** 从 Authorization 头或 token 查询参数里取 token（前端两种都用）。 */
export function extractToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const url = new URL(request.url);
  return url.searchParams.get('token');
}
