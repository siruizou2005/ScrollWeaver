/**
 * 世界观检索。
 *
 * 旧版用本地 bge-small（torch + transformers + modelscope，约 580MB 依赖 +
 * 首次运行下载 98MB 模型）配 ChromaDB 持久化，只为在提示词里塞几行世界观参考。
 * 这是整个项目最大的部署负担，也是 serverless 化的头号阻塞。
 *
 * 取舍：这里默认用**词法检索**（中文按二元字组，英文按词），零依赖、零网络往返。
 * 理由是语料极小——一个世界观切成几十段，检索目标只是给提示词补几句设定参考，
 * 而不是在百万文档里找答案。若改用向量，每次角色行动都要多一次 embedding 往返
 * （实测 300ms+），一轮多角色就会明显拖慢，收益却很有限。
 *
 * 内容包里保留了 vector 字段：若将来接 Workers AI embedding，
 * cosine() 已就位，只需在 searchWorld 里加一条分支。
 */

import type { ContentPack } from './content';

export interface Chunk {
  text: string;
  vector?: number[];
}

/** 中文按二元字组切，英文/数字按词切——不引入分词库。 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const normalized = text.toLowerCase();

  // 英文与数字整体成词
  for (const m of normalized.matchAll(/[a-z0-9]+/g)) {
    tokens.push(m[0]);
  }
  // CJK 字符按二元组滑窗
  const cjk = normalized.replace(/[^一-鿿]/g, ' ');
  for (const run of cjk.split(/\s+/)) {
    if (run.length === 1) tokens.push(run);
    for (let i = 0; i + 1 < run.length; i++) {
      tokens.push(run.slice(i, i + 2));
    }
  }
  return tokens;
}

function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/**
 * 词法相似度：查询词在文档中的覆盖度，按文档长度做温和归一。
 * 不用完整 BM25——语料太小，IDF 统计不稳定，反而引入噪声。
 */
function lexicalScore(queryTf: Map<string, number>, docTokens: string[]): number {
  if (docTokens.length === 0) return 0;
  const docTf = termFreq(docTokens);
  let hit = 0;
  for (const [term, qCount] of queryTf) {
    const dCount = docTf.get(term);
    if (dCount) hit += Math.min(qCount, dCount);
  }
  if (hit === 0) return 0;
  // 除以 sqrt(长度) 抑制长文档的天然优势，但不至于过度惩罚
  return hit / Math.sqrt(docTokens.length);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 在世界观语料里检索最相关的若干段。 */
export async function searchWorld(
  pack: ContentPack,
  query: string,
  topK: number,
): Promise<string[]> {
  const chunks = pack.worldChunks ?? [];
  if (chunks.length === 0 || !query.trim()) return [];

  const queryTf = termFreq(tokenize(query));
  const scored = chunks
    .map((chunk) => ({ text: chunk.text, score: lexicalScore(queryTf, tokenize(chunk.text)) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map((s) => s.text);
}

/** 把长文本切成检索用的段落。构建期与运行期共用，保证切分一致。 */
export function chunkText(text: string, maxChars = 180): string[] {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      chunks.push(para);
      continue;
    }
    // 长段落按句号切，避免把一句话劈开
    let buffer = '';
    for (const sentence of para.split(/(?<=[。！？.!?])/)) {
      if (buffer.length + sentence.length > maxChars && buffer) {
        chunks.push(buffer.trim());
        buffer = '';
      }
      buffer += sentence;
    }
    if (buffer.trim()) chunks.push(buffer.trim());
  }
  return chunks;
}
