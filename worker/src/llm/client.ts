/**
 * 统一的 LLM 客户端。
 *
 * 旧版有 14 个适配器（Gemini / Claude / Qwen / DeepSeek / Doubao / LangChainGPT /
 * LangChainGPT2 / VertexGemini2 / Ollama / VLLM / LocalModel / OpenRouter ...），
 * 接口各不相同：只有 Gemini 支持结构化输出，其余传 response_model 直接 TypeError；
 * Gemini 的 fallback 分支还会静默丢掉 response_model，把 str 返回给期待模型实例的调用方，
 * 于是调用方 `response.motivation` 抛 AttributeError，被 except 吞掉降级成文本——
 * 结构化输出实际从未生效，且没人发现。
 *
 * 这里只有一个实现。所有供应商都说 OpenAI 协议，差异全部压进 config.Provider。
 */

import type { TypeOf, ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { type Config, type Provider, providerForModel } from '@/config';

export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}

export const system = (content: string): Message => ({ role: 'system', content });
export const user = (content: string): Message => ({ role: 'user', content });
export const assistant = (content: string): Message => ({ role: 'assistant', content });

export class LLMError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = 'LLMError';
  }
}

export class LLMStructuredError extends LLMError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'LLMStructuredError';
  }
}

/** 推理型模型（GLM-4.x、DeepSeek-R1 等）把思考过程放在 <think></think> 里。 */
const THINK_BLOCK = /<think>[\s\S]*?<\/think>/g;
/** 模型常把 JSON 裹在 ```json ``` 代码块里。 */
const CODE_FENCE = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/;

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const JSON_INSTRUCTION = (schema: string) =>
  '你必须只输出一个合法的 JSON 对象，不要输出任何解释、前言或 Markdown 代码块。' +
  `该对象必须严格符合以下 JSON Schema：${schema}`;

/** 剥掉思考块与代码围栏，留下正文。 */
export function cleanText(text: string): string {
  if (!text) return '';
  return text.replace(THINK_BLOCK, '').replace(CODE_FENCE, '$1').trim();
}

/**
 * 安全地把模型输出解析成对象。
 *
 * 旧版 sw_utils.json_parser 用 eval() 解析模型输出——等于执行模型生成的任意代码。
 * 这里只用 JSON.parse；失败时退回“抠出最外层 {...} 再解析”，绝不求值。
 */
export function parseJsonObject(text: string): unknown {
  const cleaned = cleanText(text);
  if (!cleaned) throw new LLMStructuredError('模型返回了空内容');
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw new LLMStructuredError(`输出中找不到 JSON 对象: ${cleaned.slice(0, 200)}`);
    }
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (err) {
      throw new LLMStructuredError(`JSON 解析失败: ${cleaned.slice(0, 200)}`, err);
    }
  }
}

interface CallOptions {
  temperature?: number;
  /** 覆盖本次调用的最大 token 数；不传则由服务端默认 */
  maxTokens?: number;
  signal?: AbortSignal;
}

export class LLM {
  constructor(
    readonly model: string,
    private readonly provider: Provider,
    private readonly config: Config,
  ) {}

  /** 返回纯文本。 */
  async complete(prompt: string | Message[], opts: CallOptions = {}): Promise<string> {
    const raw = await this.call(coerce(prompt), opts, false);
    return cleanText(raw);
  }

  /**
   * 返回经 zod 校验的结构化结果。
   *
   * 与旧版不同：失败时**不会**悄悄退化成字符串。要么给出合法结果，要么抛
   * LLMStructuredError，由调用方显式决定怎么降级。
   * 校验失败时把错误回灌给模型让它自修，通常一次就能纠正。
   */
  async structured<S extends ZodTypeAny>(
    prompt: string | Message[],
    schema: S,
    opts: CallOptions = {},
  ): Promise<TypeOf<S>> {
    const jsonSchema = JSON.stringify(zodToJsonSchema(schema, { $refStrategy: 'none' }));
    const messages: Message[] = [system(JSON_INSTRUCTION(jsonSchema)), ...coerce(prompt)];

    let lastError: unknown;
    for (let attempt = 0; attempt < this.config.llmMaxRetries; attempt++) {
      const raw = await this.call(messages, opts, true);
      try {
        return schema.parse(parseJsonObject(raw));
      } catch (err) {
        lastError = err;
        const detail = err instanceof Error ? err.message : String(err);
        console.warn(
          `[llm] 结构化输出校验失败 (第 ${attempt + 1}/${this.config.llmMaxRetries} 次): ${detail}`,
        );
        messages.push(assistant(raw.slice(0, 2000)));
        messages.push(user(`上面的输出不符合 schema，错误：${detail}。请只输出修正后的 JSON。`));
      }
    }
    throw new LLMStructuredError(
      `结构化输出在 ${this.config.llmMaxRetries} 次尝试后仍无法解析`,
      lastError,
    );
  }

  private async call(messages: Message[], opts: CallOptions, jsonMode: boolean): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: opts.temperature ?? 0.8,
    };
    if (jsonMode) body.response_format = { type: 'json_object' };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    // 端点特有的调优参数（如 GLM 的关闭思考模式）
    Object.assign(body, this.provider.extraBody ?? {});

    let lastError: unknown;
    for (let attempt = 0; attempt < this.config.llmMaxRetries; attempt++) {
      // Workers 没有 socket 级超时，用 AbortSignal 兜住挂死的请求
      const timeout = AbortSignal.timeout(this.config.llmTimeoutMs);
      const signal = opts.signal ? anySignal([opts.signal, timeout]) : timeout;

      try {
        const res = await fetch(`${trimSlash(this.provider.baseUrl)}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.provider.apiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const err = new LLMError(
            `${this.provider.name}/${this.model} 返回 ${res.status}: ${text.slice(0, 300)}`,
          );
          if (RETRYABLE_STATUS.has(res.status) && attempt < this.config.llmMaxRetries - 1) {
            lastError = err;
            await sleep(2 ** attempt * 1000);
            continue;
          }
          throw err;
        }

        const payload = (await res.json()) as ChatCompletion;
        return payload.choices?.[0]?.message?.content ?? '';
      } catch (err) {
        if (err instanceof LLMError) throw err;
        lastError = err;
        // 网络错误 / 超时：可重试
        if (attempt < this.config.llmMaxRetries - 1) {
          await sleep(2 ** attempt * 1000);
          continue;
        }
        throw new LLMError(`${this.provider.name}/${this.model} 调用失败: ${describe(err)}`, err);
      }
    }
    throw new LLMError(`${this.provider.name}/${this.model} 调用失败: ${describe(lastError)}`, lastError);
  }
}

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

function coerce(prompt: string | Message[]): Message[] {
  return typeof prompt === 'string' ? [user(prompt)] : [...prompt];
}

function trimSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** AbortSignal.any 在 workerd 上可用，这里做一层保底。 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

/** 按模型名取客户端；model 为空时用配置里的默认模型。 */
export function getLLM(config: Config, model?: string, kind: 'role' | 'world' = 'role'): LLM {
  const name = model || (kind === 'world' ? config.worldModel : config.roleModel);
  return new LLM(name, providerForModel(config, name), config);
}
