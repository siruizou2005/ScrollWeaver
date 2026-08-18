/**
 * 书卷创建：手动填写与 AI 生成。
 *
 * 旧版 fast_scroll_generator.py（752 行）直接持有 genai 客户端、硬编码
 * llm_name="gemini-2.5-pro"，并把生成结果写成一堆散落的 json 文件到磁盘。
 * 这里生成后直接打包成与系统预设同构的 ContentPack 存进 KV，
 * 因此用户书卷和系统书卷走完全相同的加载路径，不需要两套逻辑。
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { loadConfig } from '@/config';
import { savePack, type ContentPack, type LocationInfo, type RoleInfo } from '@/domain/content';
import { chunkText } from '@/domain/retrieval';
import { ScrollConfig } from '@/domain/schemas';
import { getLLM, LLMError } from '@/llm';

import { currentUser, requireAuth, type App } from './middleware';

export const creationRoutes = new Hono<App>();

/** 角色名 -> role_code。中文名无法直接做标识符，用序号保证唯一且稳定。 */
function makeCode(index: number, lang: string): string {
  return `custom${index + 1}-${lang}`;
}

function buildPack(args: {
  id: string;
  title: string;
  description: string;
  language: 'zh' | 'en';
  worldName: string;
  worldDescription: string;
  characters: { name: string; nickname?: string; profile: string; gender?: string; identity?: string[] }[];
  locations: { name: string; description: string; detail?: string }[];
}): ContentPack {
  const roles: Record<string, RoleInfo> = {};
  args.characters.forEach((ch, i) => {
    const code = makeCode(i, args.language);
    roles[code] = {
      role_code: code,
      role_name: ch.name,
      nickname: ch.nickname || ch.name,
      source: args.id,
      activity: 1,
      profile: ch.profile,
      gender: ch.gender ?? '',
      identity: ch.identity ?? [],
      relation: {},
    };
  });

  const locations: Record<string, LocationInfo> = {};
  args.locations.forEach((loc, i) => {
    const code = `loc${i + 1}`;
    locations[code] = {
      location_code: code,
      location_name: loc.name,
      source: args.id,
      description: loc.description,
      detail: loc.detail ?? loc.description,
    };
  });

  // 用户书卷地点默认全连通，距离 1——旧版新建书卷也是这个规则
  const adjacency: Record<string, number> = {};
  const codes = Object.keys(locations);
  for (const a of codes) {
    for (const b of codes) {
      if (a !== b) adjacency[`${a}\t${b}`] = 1;
    }
  }

  return {
    preset: {
      id: args.id,
      title: args.title,
      description: args.description,
      source: args.id,
      language: args.language,
      performer_codes: Object.keys(roles),
      intervention: '',
      script: '',
    },
    world: {
      source: args.id,
      title: args.title,
      world_name: args.worldName,
      language: args.language,
      description: args.worldDescription,
      detail: args.worldDescription,
    },
    roles,
    locations,
    adjacency,
    worldChunks: chunkText([args.description, args.worldDescription].filter(Boolean).join('\n')).map(
      (text) => ({ text }),
    ),
  };
}

const manualBody = z.object({
  title: z.string().min(1, '标题不能为空'),
  language: z.enum(['zh', 'en']).default('zh'),
  description: z.string().default(''),
  worldName: z.string().default(''),
  worldDescription: z.string().default(''),
  locations: z
    .array(z.object({ name: z.string().min(1), description: z.string().default('') }))
    .min(1, '至少需要一个地点'),
  characters: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string().default(''),
        description: z.string().default(''),
      }),
    )
    .min(1, '至少需要一个角色'),
});

creationRoutes.post('/create-scroll', requireAuth, async (c) => {
  const parsed = manualBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ detail: parsed.error.issues[0]?.message ?? '参数不合法' }, 400);
  }
  const data = parsed.data;
  const user = currentUser(c);
  const id = `user_${user.sub}_${crypto.randomUUID().slice(0, 8)}`;

  const pack = buildPack({
    id,
    title: data.title,
    description: data.description,
    language: data.language,
    worldName: data.worldName || data.title,
    worldDescription: data.worldDescription || data.description,
    characters: data.characters.map((ch) => ({
      name: ch.name,
      profile: ch.description || ch.role,
      identity: ch.role ? [ch.role] : [],
    })),
    locations: data.locations,
  });

  await savePack(c.env.CONTENT, pack);
  await c.get('repo').createScroll({
    id,
    user_id: user.sub,
    title: data.title,
    description: data.description,
    language: data.language,
    is_public: 0,
  });

  return c.json({ success: true, scroll_id: id });
});

const promptBody = z.object({
  description: z.string().min(4, '描述太短'),
  title: z.string().default(''),
  language: z.enum(['zh', 'en']).default('zh'),
  num_characters: z.coerce.number().int().min(1).max(12).default(4),
  num_locations: z.coerce.number().int().min(1).max(12).default(4),
});

creationRoutes.post('/generate-scroll-from-prompt', requireAuth, async (c) => {
  const parsed = promptBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ detail: parsed.error.issues[0]?.message ?? '参数不合法' }, 400);
  }
  const { description, title, language, num_characters, num_locations } = parsed.data;
  const config = loadConfig(c.env);

  const instruction =
    language === 'zh'
      ? `根据下面的描述，构建一个可供多角色互动的世界设定。\n\n描述：${description}\n\n` +
        `要求：恰好 ${num_characters} 个角色、恰好 ${num_locations} 个地点。` +
        '角色必须是具体的人名并各有鲜明性格与立场，彼此之间要存在张力；' +
        '地点要具体、可发生事件。全部用中文。'
      : `Build an interactive world setting from the description below.\n\n` +
        `Description: ${description}\n\n` +
        `Requirements: exactly ${num_characters} characters and exactly ${num_locations} locations. ` +
        'Characters must have concrete names, distinct personalities and conflicting stances.';

  let generated;
  try {
    generated = await getLLM(config, undefined, 'world').structured(instruction, ScrollConfig, {
      temperature: 0.9,
    });
  } catch (err) {
    console.error('[creation] 生成失败:', err);
    return c.json({ detail: err instanceof LLMError ? err.message : '书卷生成失败' }, 502);
  }

  const user = currentUser(c);
  const id = `user_${user.sub}_${crypto.randomUUID().slice(0, 8)}`;
  const finalTitle = title || generated.world.world_name || '未命名书卷';

  const pack = buildPack({
    id,
    title: finalTitle,
    description: generated.world.description,
    language,
    worldName: generated.world.world_name,
    worldDescription: generated.world.description,
    characters: generated.characters.map((ch) => ({
      name: ch.role_name,
      nickname: ch.nickname,
      profile: ch.profile,
      gender: ch.gender,
      identity: ch.identity,
    })),
    locations: generated.locations.map((loc) => ({
      name: loc.location_name,
      description: loc.description,
      detail: loc.detail,
    })),
  });

  await savePack(c.env.CONTENT, pack);
  await c.get('repo').createScroll({
    id,
    user_id: user.sub,
    title: finalTitle,
    description: generated.world.description,
    language,
    is_public: 0,
  });

  return c.json({ success: true, scroll_id: id, title: finalTitle });
});

/**
 * 从文档生成书卷。
 *
 * 文字提取在浏览器完成（web/frontend/js/common/doc-extract.js），这里只收纯文本。
 * 这么分工是因为 Workers 免费版限 10ms CPU/次调用，而 PDF 解析是纯计算，
 * 放服务端必被掐断；等 LLM 返回不计 CPU，两者不是一回事。
 *
 * 与 /generate-scroll-from-prompt 的区别在提示词：那边是凭空创作，
 * 这边是**从既有文本里归纳**，要求忠于原著而不是自由发挥。
 */
const documentBody = z.object({
  text: z.string().min(200, '文档内容太少，无法生成书卷'),
  filename: z.string().default(''),
  title: z.string().default(''),
  language: z.enum(['zh', 'en']).default('zh'),
  num_characters: z.coerce.number().int().min(1).max(12).default(5),
  num_locations: z.coerce.number().int().min(1).max(12).default(4),
  truncated: z.boolean().default(false),
});

creationRoutes.post('/upload-document', requireAuth, async (c) => {
  const parsed = documentBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ detail: parsed.error.issues[0]?.message ?? '参数不合法' }, 400);
  }
  const { text, filename, title, language, num_characters, num_locations, truncated } = parsed.data;
  const config = loadConfig(c.env);

  const instruction =
    language === 'zh'
      ? `下面是一份文档的内容${filename ? `（文件名：${filename}）` : ''}${truncated ? '（因过长已截取首尾部分）' : ''}。\n\n` +
        `请从中**归纳**出一个可供多角色互动的世界设定，而不是另行创作：\n` +
        `- 角色必须是文档中真实出现的人物，用原文里的名字，性格与立场忠于原文；\n` +
        `- 地点必须是文档中真实出现的场所；\n` +
        `- 世界观描述要概括这份文档所处的时代、环境与主要矛盾。\n` +
        `如果文档中的人物或地点不足 ${num_characters} 个 / ${num_locations} 个，就以实际数量为准，不要编造。\n` +
        `目标数量：约 ${num_characters} 个角色、约 ${num_locations} 个地点。\n\n` +
        `文档内容：\n${text}`
      : `Below is the content of a document${filename ? ` (filename: ${filename})` : ''}` +
        `${truncated ? ' (truncated: head and tail only)' : ''}.\n\n` +
        `Derive an interactive world setting **from this text** rather than inventing one:\n` +
        `- Characters must be people who actually appear in the document, using their original names;\n` +
        `- Locations must be places that actually appear in the document;\n` +
        `- The world description should summarise the era, setting and central conflicts.\n` +
        `If the document contains fewer than ${num_characters} characters or ${num_locations} locations, ` +
        `use what is actually there; do not fabricate.\n\n` +
        `Document:\n${text}`;

  let generated;
  try {
    generated = await getLLM(config, undefined, 'world').structured(instruction, ScrollConfig, {
      temperature: 0.6, // 归纳任务，温度低于自由创作
    });
  } catch (err) {
    console.error('[creation] 文档生成失败:', err);
    return c.json({ detail: err instanceof LLMError ? err.message : '从文档生成书卷失败' }, 502);
  }

  const user = currentUser(c);
  const id = `user_${user.sub}_${crypto.randomUUID().slice(0, 8)}`;
  const finalTitle =
    title || generated.world.world_name || filename.replace(/\.[^.]+$/, '') || '未命名书卷';

  const pack = buildPack({
    id,
    title: finalTitle,
    description: generated.world.description,
    language,
    worldName: generated.world.world_name,
    worldDescription: generated.world.description,
    characters: generated.characters.map((ch) => ({
      name: ch.role_name,
      nickname: ch.nickname,
      profile: ch.profile,
      gender: ch.gender,
      identity: ch.identity,
    })),
    locations: generated.locations.map((loc) => ({
      name: loc.location_name,
      description: loc.description,
      detail: loc.detail,
    })),
  });

  await savePack(c.env.CONTENT, pack);
  await c.get('repo').createScroll({
    id,
    user_id: user.sub,
    title: finalTitle,
    description: generated.world.description,
    language,
    is_public: 0,
  });

  return c.json({
    success: true,
    scroll_id: id,
    title: finalTitle,
    characters: generated.characters.length,
    locations: generated.locations.length,
  });
});
