/**
 * 提示词的语言分发与渲染。
 *
 * 旧版在 orchestrator.init_prompt() 里用 if language == "zh" 逐个 import 再赋给
 * self._XXX_PROMPT，一个语言分支 20 多行；而且英文版缺 SOUL_TRANS_PROLOGUE_PROMPT
 * 时用 `self._X = ""` 静默兜底，出问题很难发现。
 * 这里按语言取整包，缺哪个模板在类型层面就会报错。
 */

import * as orchestratorZh from './orchestrator_zh';
import * as orchestratorEn from './orchestrator_en';
import * as performerZh from './performer_zh';
import * as performerEn from './performer_en';

export type Language = 'zh' | 'en';

export const orchestratorPrompts = (lang: Language) =>
  lang === 'zh' ? orchestratorZh : orchestratorEn;

export const performerPrompts = (lang: Language) =>
  lang === 'zh' ? performerZh : performerEn;

/**
 * 填充 {name} 占位符。
 *
 * 与 Python .format() 的差异：缺失的键**保持原样**而不是抛 KeyError。
 * 提示词里存在 JSON 示例等自带花括号的片段，抛错会让正常提示词无法渲染。
 */
export function render(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key] ?? '') : match,
  );
}
