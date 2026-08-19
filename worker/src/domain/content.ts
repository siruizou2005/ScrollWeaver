/**
 * 静态内容（世界观 / 角色 / 地点 / 地图）的类型与加载。
 *
 * 旧版在开局时从文件系统散读几十个 JSON：预设 → world_info → 每个角色的
 * role_info.json → locations.json → map.csv，还要 get_child_folders 遍历目录做
 * 模糊匹配找角色路径。Workers 没有文件系统，而且散读会放大延迟。
 *
 * 这里改成**一个书卷打包成一个 KV 条目**，开局一次读取拿全。
 * 打包由 scripts/import-content.ts 在构建期完成。
 */

import type { Language } from '@/prompts';

import type { PersonalityProfile } from './persona';

export interface RoleInfo {
  role_code: string;
  role_name: string;
  nickname: string;
  source: string;
  activity: number;
  profile: string;
  gender: string;
  identity: string[];
  relation: Record<string, { relation: string[]; detail: string }>;
  /**
   * 三层人格画像。当前 82 个角色全部带此字段，但保持可选：
   * 用户自建的书卷不一定有，缺失时角色走无人格的原路径。
   */
  personality?: PersonalityProfile;
}

export interface WorldInfo {
  source: string;
  title: string;
  world_name: string;
  language: Language;
  description: string;
  detail: string;
}

export interface LocationInfo {
  location_code: string;
  location_name: string;
  source: string;
  description: string;
  detail: string;
}

/** 地点间距离：`${from}\t${to}` -> distance */
export type Adjacency = Record<string, number>;

export interface ScrollPreset {
  id: string;
  title: string;
  description: string;
  source: string;
  language: Language;
  performer_codes: string[];
  intervention: string;
  script: string;
}

/** 一个书卷开局所需的全部静态内容。 */
export interface ContentPack {
  preset: ScrollPreset;
  world: WorldInfo;
  roles: Record<string, RoleInfo>;
  locations: Record<string, LocationInfo>;
  adjacency: Adjacency;
  /**
   * 世界观检索语料。当前走词法检索（见 domain/retrieval.ts 的取舍说明），
   * vector 为将来接 embedding 预留，故可选。
   */
  worldChunks: { text: string; vector?: number[] }[];
}

export class ContentNotFound extends Error {}

const packKey = (scrollId: string) => `pack:${scrollId}`;
const INDEX_KEY = 'index:scrolls';

export async function loadPack(kv: KVNamespace, scrollId: string): Promise<ContentPack> {
  const pack = await kv.get<ContentPack>(packKey(scrollId), 'json');
  if (!pack) throw new ContentNotFound(`书卷 ${scrollId} 的内容包不存在`);
  return pack;
}

export async function savePack(kv: KVNamespace, pack: ContentPack): Promise<void> {
  await kv.put(packKey(pack.preset.id), JSON.stringify(pack));
}

/** 系统预设书卷列表（广场页用）。 */
export async function listScrolls(kv: KVNamespace): Promise<ScrollPreset[]> {
  return (await kv.get<ScrollPreset[]>(INDEX_KEY, 'json')) ?? [];
}

export async function saveScrollIndex(kv: KVNamespace, presets: ScrollPreset[]): Promise<void> {
  await kv.put(INDEX_KEY, JSON.stringify(presets));
}

// ---------- 查询辅助 ----------

export function locationName(pack: ContentPack, code: string): string {
  return pack.locations[code]?.location_name ?? code;
}

export function distance(pack: ContentPack, from: string, to: string): number {
  if (from === to) return 0;
  return pack.adjacency[`${from}\t${to}`] ?? pack.adjacency[`${to}\t${from}`] ?? 1;
}

/**
 * 按角色名反查 role_code。
 *
 * 旧版 name2code 会在 role_name / nickname / 带后缀的 code 之间做多轮模糊匹配，
 * 匹配不上时返回 None 而调用方常常不检查，导致后续用 None 当 key。
 * 这里保留同样的宽松匹配（LLM 返回的名字确实不稳定），但**匹配失败显式返回 null**，
 * 由调用方决定回退策略。
 */
export function nameToCode(pack: ContentPack, name: string): string | null {
  if (!name) return null;
  const needle = name.trim();
  if (pack.roles[needle]) return needle;

  for (const [code, role] of Object.entries(pack.roles)) {
    if (role.role_name === needle || role.nickname === needle) return code;
  }
  // 去掉语言后缀再试（"liubei" 匹配 "liubei-zh"）
  const lowered = needle.toLowerCase();
  for (const code of Object.keys(pack.roles)) {
    if (code.toLowerCase().replace(/-(zh|en)$/, '') === lowered.replace(/-(zh|en)$/, '')) {
      return code;
    }
  }
  // 最后尝试包含匹配
  for (const [code, role] of Object.entries(pack.roles)) {
    if (needle.includes(role.role_name) || needle.includes(role.nickname)) return code;
  }
  return null;
}
