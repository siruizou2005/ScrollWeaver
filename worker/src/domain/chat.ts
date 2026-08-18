/**
 * 私语模式：与单个角色一对一对话。
 *
 * 对应旧版 modules/chat/chat_performer.py（578 行）。旧版直接持有 google.genai
 * 客户端、硬编码 llm_name="gemini-3-flash-preview"，且没有 key 时直接
 * raise ValueError("Gemini 客户端未配置") 让整个功能不可用。
 *
 * 提示词结构参考 SillyTavern 的分层拼装（角色设定 / 世界观 / 示例对话 / 历史），
 * 这一点与旧版保持一致。
 */

import type { LLM } from '@/llm';
import { system, user, assistant, type Message } from '@/llm';

import type { ContentPack } from './content';
import type { ChatMessage } from '@/storage/repo';

/** 只保留最近若干轮，避免上下文无限增长。 */
const MAX_TURNS = 24;

export function buildSystemPrompt(pack: ContentPack, roleCode: string, userName: string): string {
  const role = pack.roles[roleCode];
  if (!role) throw new Error(`角色 ${roleCode} 不存在`);

  const relations = Object.entries(role.relation ?? {})
    .map(([code, rel]) => {
      const other = pack.roles[code];
      return other ? `- 与${other.role_name}：${rel.relation.join('、')}。${rel.detail}` : '';
    })
    .filter(Boolean)
    .join('\n');

  const parts = [
    `【角色设定】你是${role.role_name}${role.nickname !== role.role_name ? `（${role.nickname}）` : ''}。`,
    role.profile,
    role.identity?.length ? `身份：${role.identity.join('、')}` : '',
    relations ? `【人物关系】\n${relations}` : '',
    `【世界观】${pack.world.title}：${pack.world.description}`,
    pack.world.detail ? pack.world.detail : '',
    `【对话规则】
1. 始终以${role.role_name}的身份、口吻和价值观说话，不要跳出角色。
2. 不要提及你是 AI、模型或程序，也不要解释自己的设定。
3. 回复长度控制在 2-4 句，像真实对话而非独白。
4. 用纯文本，不要使用 Markdown 标记。
5. 对方称呼为「${userName}」。`,
  ];
  return parts.filter(Boolean).join('\n\n');
}

export function buildMessages(
  pack: ContentPack,
  roleCode: string,
  history: ChatMessage[],
  userName: string,
): Message[] {
  const messages: Message[] = [system(buildSystemPrompt(pack, roleCode, userName))];
  for (const m of history.slice(-MAX_TURNS)) {
    messages.push(m.role === 'user' ? user(m.content) : assistant(m.content));
  }
  return messages;
}

export async function replyAsRole(
  llm: LLM,
  pack: ContentPack,
  roleCode: string,
  history: ChatMessage[],
  userName: string,
): Promise<string> {
  const reply = await llm.complete(buildMessages(pack, roleCode, history, userName), {
    temperature: 0.85,
  });
  return reply.trim();
}

/** 角色的开场白：没有历史时用简介引出，避免冷启动空白。 */
export function greeting(pack: ContentPack, roleCode: string): string {
  const role = pack.roles[roleCode];
  if (!role) return '';
  return pack.preset.language === 'zh'
    ? `（${role.role_name}抬眼看向你）`
    : `(${role.role_name} looks up at you.)`;
}
