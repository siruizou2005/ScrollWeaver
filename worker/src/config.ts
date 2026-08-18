/**
 * 单一配置源。
 *
 * 旧版的问题：config.json 里写着模型名，但代码里有 7 处硬编码 `gemini-2.5-flash`
 * 之类的字面量直接绕过它，配置形同虚设；API key 靠 `if "API_KEY" in key` 这种
 * 模糊匹配散进全局环境变量，谁在用哪个 key 无从追踪。
 *
 * 这里只有一条规则：**所有配置从 Config 出，业务代码里不出现任何字面量模型名。**
 * Workers 没有文件系统，配置全部来自 env bindings（wrangler.toml 的 vars 与 secrets）。
 */

/** Worker 的全部绑定。缺失的绑定在类型上就是可选，强制调用方处理。 */
export interface Env {
  /** 前端静态资源（web/ 目录），由 Workers Assets 托管 */
  ASSETS: Fetcher;

  // --- 存储 ---
  DB: D1Database;
  /** 角色 / 世界观 / 预设等静态内容 */
  CONTENT: KVNamespace;
  /** 头像、地图背景、用户上传 */
  MEDIA: R2Bucket;

  // --- Durable Objects ---
  STORY_SESSION: DurableObjectNamespace;
  ROOM: DurableObjectNamespace;
  BUSINESS_GAME: DurableObjectNamespace;
  WHO_IS_HUMAN: DurableObjectNamespace;
  WEREWOLF_GAME: DurableObjectNamespace;

  // --- 模型选择（vars）---
  ROLE_MODEL?: string;
  WORLD_MODEL?: string;
  EMBEDDING_MODEL?: string;
  LLM_TIMEOUT_MS?: string;
  LLM_MAX_RETRIES?: string;
  RETRIEVAL_TOP_K?: string;

  // --- 供应商端点（vars，可覆盖内置默认值）---
  GLM_API_BASE?: string;
  OPENAI_API_BASE?: string;
  DEEPSEEK_API_BASE?: string;
  KIMI_API_BASE?: string;
  DASHSCOPE_API_BASE?: string;
  OPENROUTER_API_BASE?: string;

  // --- 密钥（secrets）---
  GLM_API_KEY?: string;
  OPENAI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  KIMI_API_KEY?: string;
  DASHSCOPE_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  JWT_SECRET: string;
}

/** 一个 OpenAI 兼容端点。 */
export interface Provider {
  name: string;
  baseUrl: string;
  apiKey: string;
  /** 该端点下模型名的前缀，用于按模型名反查供应商 */
  modelPrefixes: readonly string[];
  /**
   * 合并进请求体的端点特有参数。
   *
   * OpenAI 协议是最小公约数，各家都有协议外的调优开关。把它们收在这里，
   * 而不是在业务代码里 if 供应商名 —— 加一家的成本仍然是「表里加一行」。
   */
  extraBody?: Record<string, unknown>;
}

/**
 * 内置端点表。
 *
 * 本项目只支持 OpenAI 协议 —— 所有供应商都走同一套 /chat/completions，
 * 所以“适配器”退化成一份配置。加一家供应商 = 在这张表里加一行。
 */
const PROVIDER_TABLE = [
  {
    name: 'GLM',
    defaultBase: 'https://open.bigmodel.cn/api/paas/v4',
    prefixes: ['glm-'],
    // GLM-4.x 默认开启思考模式，实测同一提示 29s vs 8.3s。
    // 本项目每回合要串起多次调用，这个延迟会直接叠加到玩家等待上，故关闭。
    extraBody: { thinking: { type: 'disabled' } },
  },
  { name: 'OPENAI',     defaultBase: 'https://api.openai.com/v1',                       prefixes: ['gpt-', 'o1-', 'o3-', 'o4-'] },
  { name: 'DEEPSEEK',   defaultBase: 'https://api.deepseek.com/v1',                     prefixes: ['deepseek-'] },
  { name: 'KIMI',       defaultBase: 'https://api.moonshot.cn/v1',                      prefixes: ['moonshot-', 'kimi-'] },
  { name: 'DASHSCOPE',  defaultBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1', prefixes: ['qwen-'] },
  { name: 'OPENROUTER', defaultBase: 'https://openrouter.ai/api/v1',                    prefixes: ['openrouter/'] },
] as const;

export interface Config {
  roleModel: string;
  worldModel: string;
  embeddingModel: string;
  providers: Provider[];
  llmTimeoutMs: number;
  llmMaxRetries: number;
  retrievalTopK: number;
  jwtSecret: string;
}

export class ConfigError extends Error {}

function intVar(raw: string | undefined, fallback: number): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 从 env 解析出配置。纯函数，便于测试。 */
export function loadConfig(env: Env): Config {
  const providers: Provider[] = PROVIDER_TABLE.map((entry) => ({
    name: entry.name,
    baseUrl: (env[`${entry.name}_API_BASE` as keyof Env] as string | undefined) || entry.defaultBase,
    apiKey: (env[`${entry.name}_API_KEY` as keyof Env] as string | undefined) || '',
    modelPrefixes: entry.prefixes,
    extraBody: 'extraBody' in entry ? (entry.extraBody as Record<string, unknown>) : undefined,
  }));

  const roleModel = env.ROLE_MODEL || 'glm-4.7';

  return {
    roleModel,
    worldModel: env.WORLD_MODEL || roleModel,
    embeddingModel: env.EMBEDDING_MODEL || 'embedding-3',
    providers,
    llmTimeoutMs: intVar(env.LLM_TIMEOUT_MS, 120_000),
    llmMaxRetries: intVar(env.LLM_MAX_RETRIES, 3),
    retrievalTopK: intVar(env.RETRIEVAL_TOP_K, 3),
    jwtSecret: env.JWT_SECRET,
  };
}

/**
 * 按模型名前缀解析供应商。
 *
 * 找不到匹配前缀时回落到第一个已配置的端点 —— 让“任意中转 + 任意模型名”
 * 这种常见场景不必改代码就能用。
 */
export function providerForModel(config: Config, model: string): Provider {
  const lowered = model.toLowerCase();
  for (const provider of config.providers) {
    if (provider.apiKey && provider.modelPrefixes.some((p) => lowered.startsWith(p))) {
      return provider;
    }
  }
  const anyConfigured = config.providers.find((p) => p.apiKey);
  if (anyConfigured) return anyConfigured;
  throw new ConfigError(
    '没有任何可用的 LLM 端点。请用 `wrangler secret put GLM_API_KEY`（或其它供应商）配置密钥。',
  );
}
