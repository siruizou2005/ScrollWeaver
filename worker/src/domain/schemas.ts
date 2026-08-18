/**
 * 结构化输出的契约。
 *
 * 从旧版 modules/models/response_models.py 的 pydantic 模型逐一移植。
 * 这些 description 不是注释——它们会被序列化进 JSON Schema 发给模型，
 * 直接决定输出质量，因此保持原文语义，不做“精简”。
 */

import { z } from 'zod';

// ---------- 角色行动 ----------

export const RolePlan = z.object({
  action: z.string().describe('Represents the action, expressed as a single verb.'),
  interact_type: z
    .enum(['role', 'environment', 'npc', 'no'])
    .describe(
      "Indicates the interaction target of your action. 'role' for character interaction, " +
        "'environment' for environmental interaction, 'npc' for non-character interaction, " +
        "'no' for no interaction.",
    ),
  target_role_codes: z
    .array(z.string())
    .default([])
    .describe(
      "List of target character codes if 'interact_type' is 'role'. " +
        "For 'single' interaction, this list should have exactly one element.",
    ),
  target_npc_name: z
    .string()
    .nullable()
    .default(null)
    .describe("Target NPC name if 'interact_type' is 'npc'."),
  visible_role_codes: z
    .array(z.string())
    .default([])
    .describe("List of role codes that can see this action. Should include 'target_role_codes'."),
  detail: z
    .string()
    .describe(
      'A literary narrative statement containing thoughts, speech, and actions. ' +
        'Must be plain text without Markdown formatting. ' +
        'Must not mention, speak to, or reference characters not present in the current scene.',
    ),
});
export type RolePlan = z.infer<typeof RolePlan>;

export const SingleRoleResponse = z.object({
  if_end_interaction: z
    .boolean()
    .describe("Set to true if it's appropriate to end this interaction."),
  extra_interact_type: z
    .enum(['environment', 'npc', 'no'])
    .describe(
      "'environment' indicates additional environmental interaction needed, " +
        "'npc' means additional interaction with non-main character needed, " +
        "'no' means no extra interaction needed.",
    ),
  target_npc_name: z
    .string()
    .nullable()
    .default(null)
    .describe("Target NPC name or job if 'extra_interact_type' is 'npc'."),
  detail: z
    .string()
    .describe(
      'A literary narrative-style statement containing thoughts, speech, and actions. ' +
        'Must be plain text without Markdown formatting. ' +
        'Must not mention, speak to, or reference characters not present in the current scene.',
    ),
});
export type SingleRoleResponse = z.infer<typeof SingleRoleResponse>;

export const MultiRoleResponse = z.object({
  if_end_interaction: z
    .boolean()
    .describe("Set to true if it's appropriate to end this interaction."),
  extra_interact_type: z
    .enum(['environment', 'npc', 'no'])
    .describe(
      "'environment' indicates additional environmental interaction needed, " +
        "'npc' means additional interaction with non-main character needed, " +
        "'no' means no extra interaction needed.",
    ),
  target_role_code: z
    .string()
    .nullable()
    .default(null)
    .describe('Target role code if additional interaction is needed.'),
  target_npc_name: z
    .string()
    .nullable()
    .default(null)
    .describe("Target NPC name if 'extra_interact_type' is 'npc'."),
  visible_role_codes: z
    .array(z.string())
    .default([])
    .describe('List of role codes that can see this action.'),
  detail: z
    .string()
    .describe(
      'A literary narrative-style statement containing thoughts, speech, and actions. ' +
        'Must be plain text without Markdown formatting. ' +
        'Must not mention, speak to, or reference characters not present in the current scene.',
    ),
});
export type MultiRoleResponse = z.infer<typeof MultiRoleResponse>;

export const NPCRoleResponse = z.object({
  if_end_interaction: z
    .boolean()
    .describe('Set to true if you believe this interaction should conclude.'),
  detail: z
    .string()
    .describe(
      'A literary and narrative description that includes thoughts, speech, and actions. ' +
        'Must be plain text without Markdown formatting.',
    ),
});
export type NPCRoleResponse = z.infer<typeof NPCRoleResponse>;

// ---------- 角色状态 ----------

export const UpdateGoal = z.object({
  if_change_goal: z
    .boolean()
    .describe('Set to true if the goal is realized and needs to be updated.'),
  updated_goal: z
    .string()
    .nullable()
    .default(null)
    .describe("Updated goal if 'if_change_goal' is set to true."),
});
export type UpdateGoal = z.infer<typeof UpdateGoal>;

export const UpdateStatus = z.object({
  updated_status: z.string().describe('Updated status description.'),
  activity: z.number().describe('Activity level as a float value.'),
});
export type UpdateStatus = z.infer<typeof UpdateStatus>;

export const MoveResponse = z.object({
  if_move: z.boolean().describe('Set to true if the character should move.'),
  destination_code: z
    .string()
    .nullable()
    .default(null)
    .describe("Destination location code if 'if_move' is true."),
  detail: z
    .string()
    .describe('A literary narrative statement describing the movement or reason for not moving.'),
});
export type MoveResponse = z.infer<typeof MoveResponse>;

export const ThoughtChain = z.object({
  analysis: z
    .string()
    .describe(
      'Internal analysis and reasoning process. This represents the character’s internal ' +
        'thoughts and considerations. Must be plain text without Markdown formatting.',
    ),
  plan: z
    .string()
    .describe(
      'Action plan based on the analysis. This represents what the character intends to do. ' +
        'Must be plain text without Markdown formatting.',
    ),
  memory_to_save: z
    .string()
    .nullable()
    .default(null)
    .describe(
      'Important information to remember for future decisions. ' +
        "This will be stored in the character's short-term memory. Can be null if nothing important.",
    ),
});
export type ThoughtChain = z.infer<typeof ThoughtChain>;

// ---------- 编排器 ----------

export const JudgeIfEnded = z.object({
  if_end: z.boolean().describe('Set to true if the story should end.'),
  detail: z.string().describe('Explanation for the decision.'),
});
export type JudgeIfEnded = z.infer<typeof JudgeIfEnded>;

export const SceneActors = z.object({
  role_codes: z.array(z.string()).describe('List of selected role codes for the scene.'),
});
export type SceneActors = z.infer<typeof SceneActors>;

/**
 * 剧本指令。
 *
 * 旧版用 pydantic 的 `extra: allow` 承载动态的 role_code 键（每个角色一条指令）。
 * zod 用 catchall 表达同一语义，且保持类型安全。
 */
export const ScriptInstruction = z
  .object({
    progress: z.string().describe('Judgment on the overall progress.'),
  })
  .catchall(z.string());
export type ScriptInstruction = z.infer<typeof ScriptInstruction>;

export const EventText = z.object({
  event: z
    .string()
    .describe(
      'A concise event description. Should be novel, interesting, and contain conflicts between ' +
        'different characters. Must not include any details, specific character actions, ' +
        'psychology, or dialogue. Must be plain text without Markdown formatting.',
    ),
});
export type EventText = z.infer<typeof EventText>;

export const ScriptText = z.object({
  script: z
    .string()
    .describe(
      'A script description for the scene. Should be vivid, visual, and match the worldview style. ' +
        'Only describe the current situation, do not make actions for characters. ' +
        'Must be plain text without Markdown formatting.',
    ),
});
export type ScriptText = z.infer<typeof ScriptText>;

// ---------- 动机 ----------

export const MotivationText = z.object({
  motivation: z
    .string()
    .describe(
      "A long-term goal/motivation related to the character's identity and background. " +
        'It should be an ultimate objective that guides the character’s actions. ' +
        'Must be plain text without Markdown formatting.',
    ),
});
export type MotivationText = z.infer<typeof MotivationText>;

export const CharacterMotivation = z.object({
  role_name: z.string().describe('Character name'),
  motivation: z
    .string()
    .describe(
      'Hidden motivation of the character, approximately 100 words (within 100 characters in Chinese). ' +
        "Should deeply explore the character's psychological level, reflect the intrinsic connection " +
        'between the character and the world setting. Must be plain text without Markdown formatting.',
    ),
});
export type CharacterMotivation = z.infer<typeof CharacterMotivation>;

export const BatchMotivations = z.object({
  motivations: z
    .array(CharacterMotivation)
    .describe('List of character motivations, one for each character'),
});
export type BatchMotivations = z.infer<typeof BatchMotivations>;

// ---------- 故事导出 ----------

export const StoryText = z.object({
  story: z
    .string()
    .describe(
      'A literary narrative expanded from action logs in third-person omniscient perspective. ' +
        'Can rearrange narrative order for dramatic effect. Can modify character action descriptions ' +
        'while preserving key information. Should add necessary scene descriptions, plot connections, ' +
        'and atmosphere. CRITICAL: Must convert all format markers to natural narrative text: ' +
        '【】inner thoughts → third-person narrative; () actions → natural narrative; ' +
        '「」speech → quotation marks. ALL markers (【】、()、「」) MUST be completely removed, ' +
        'output pure narrative text. Must be plain text without Markdown formatting or any special ' +
        'markers. Output should read like a traditional novel, flowing and natural.',
    ),
});
export type StoryText = z.infer<typeof StoryText>;

// ---------- 书卷生成 ----------

export const CharacterConfig = z.object({
  role_name: z
    .string()
    .describe("角色名称，必须是具体的人名（如'张三'、'李四'等），禁止使用'角色1'、'角色2'等占位符"),
  nickname: z.string().describe('昵称，可与角色名相同'),
  profile: z
    .string()
    .describe(
      "角色简介（100-150字），必须是对该角色的具体介绍，包括性格、背景、特点等，禁止使用'基于xxx的角色'这样的占位符",
    ),
  gender: z.string().describe('性别'),
  identity: z.array(z.string()).default([]).describe("身份列表（如 ['学生', '主角']）"),
  motivation: z.string().default('').describe('角色的动机（50字以内）'),
});
export type CharacterConfig = z.infer<typeof CharacterConfig>;

export const LocationConfig = z.object({
  location_name: z.string().describe('地点名称'),
  description: z.string().describe('地点简介（50字以内）'),
  detail: z.string().describe('地点详细描述（100-150字）'),
});
export type LocationConfig = z.infer<typeof LocationConfig>;

export const WorldConfig = z.object({
  world_name: z.string().describe('世界观名称'),
  description: z.string().describe('详细的世界观描述（200-300字）'),
  language: z.enum(['zh', 'en']).describe('语言代码'),
});
export type WorldConfig = z.infer<typeof WorldConfig>;

export const ScrollConfig = z.object({
  world: WorldConfig.describe('世界观配置'),
  characters: z
    .array(CharacterConfig)
    .min(1)
    .describe('角色列表，每个角色必须有具体的名称和介绍，名称互不相同，禁止使用占位符。'),
  locations: z.array(LocationConfig).min(1).describe('地点列表，每个地点必须有唯一的名称。'),
});
export type ScrollConfig = z.infer<typeof ScrollConfig>;

// ---------- 事件链（多幕剧情预览）----------

export const EventChainAct = z.object({
  act_number: z.number().int().describe('第几幕，从 1 开始'),
  title: z.string().describe('这一幕的标题，6-12 字'),
  main_plot: z.string().describe('明线：这一幕台面上发生的主要冲突与进展'),
  sub_plot: z.string().describe('暗线：暗中推进、尚未被角色察觉的线索'),
  key_events: z.array(z.string()).describe('这一幕的 2-4 个关键事件，每条一句话'),
  relationship_changes: z.string().describe('这一幕结束后主要角色之间关系的变化'),
});
export type EventChainAct = z.infer<typeof EventChainAct>;

export const EventChain = z.object({
  overall_theme: z.string().describe('整条故事线的核心主题，一到两句话'),
  acts: z.array(EventChainAct).describe('各幕，数量与请求的幕数一致'),
});
export type EventChain = z.infer<typeof EventChain>;
