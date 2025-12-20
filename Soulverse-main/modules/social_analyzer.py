"""
社交分析器
使用LLM分析Agent的社交行为特点
"""
from typing import Dict, List, Any, Optional
from datetime import datetime
from modules.history_manager import HistoryManager
from sw_utils import get_models


class SocialAnalyzer:
    """
    社交分析器
    使用LLM分析Agent的社交行为特点
    """
    
    def __init__(self, history_manager: HistoryManager, language: str = "zh", llm_name: str = "gpt-4o-mini"):
        """
        初始化社交分析器
        
        Args:
            history_manager: 历史管理器
            language: 语言设置
            llm_name: LLM模型名称（用于AI分析）
        """
        self.history_manager = history_manager
        self.language = language
        self.llm = get_models(llm_name) if llm_name else None
    
    def analyze_agent_behavior(self, 
                               agent_code: str,
                               agent_profile: Dict[str, Any],
                               start_time: Optional[datetime] = None,
                               end_time: Optional[datetime] = None,
                               agent_name: Optional[str] = None) -> Dict[str, Any]:
        """
        分析Agent的社交行为特点
        
        Args:
            agent_code: Agent代码
            agent_profile: Agent的profile信息（包含兴趣、MBTI、性格等）
            start_time: 开始时间
            end_time: 结束时间
            agent_name: Agent名称（可选，用于明确分析对象）
        
        Returns:
            行为分析结果
        """
        # 获取相关记录
        records = self._filter_records(agent_code, start_time, end_time)
        
        # 使用AI生成行为特点分析
        behavior_insights = self._generate_behavior_insights(
            agent_code, 
            agent_profile, 
            records,
            agent_name=agent_name or agent_code
        )
        
        return {
            "agent_code": agent_code,
            "behavior_insights": behavior_insights
        }
    
    def _filter_records(self,
                       agent_code: str,
                       start_time: Optional[datetime] = None,
                       end_time: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """筛选相关记录"""
        records = []
        
        for record in self.history_manager.detailed_history:
            # 检查时间范围
            if start_time or end_time:
                if "virtual_timestamp" in record:
                    record_time = datetime.fromtimestamp(record["virtual_timestamp"])
                    if start_time and record_time < start_time:
                        continue
                    if end_time and record_time > end_time:
                        continue
            
            # 检查是否与Agent相关
            if (record.get("role_code") == agent_code or 
                agent_code in record.get("group", []) or
                record.get("actor") == agent_code):
                records.append(record)
        
        return records
    
    def _format_chat_records(self, records: List[Dict[str, Any]], agent_code: str) -> str:
        """格式化聊天记录为可读文本，每条只标注说话者"""
        if not records:
            return "暂无聊天记录。"
        
        formatted_lines = []
        seen_records = set()  # 用于去重
        
        for record in records:
            detail = record.get("detail", "")
            if not detail or detail == "__USER_INPUT_PLACEHOLDER__":
                continue
            
            # 去重：使用detail内容作为唯一标识
            record_key = detail[:200]  # 使用前200字符作为key
            if record_key in seen_records:
                continue
            seen_records.add(record_key)
            
            # 从detail中提取说话者名称
            # detail格式通常是 "nickname: content" 或直接是content
            speaker_name = "未知"
            content = detail
            
            # 尝试从detail中提取说话者（格式："nickname: content"）
            if ":" in detail:
                parts = detail.split(":", 1)
                if len(parts) == 2:
                    potential_name = parts[0].strip()
                    # 如果第一部分看起来像名字（不太长，不包含特殊符号）
                    if len(potential_name) < 50 and not potential_name.startswith("【"):
                        speaker_name = potential_name
                        content = parts[1].strip()
            
            # 如果无法从detail提取，尝试从record中获取
            if speaker_name == "未知":
                record_role_code = record.get("role_code")
                record_actor = record.get("actor")
                # 优先使用role_code，因为detail中可能已经包含了nickname
                if record_role_code:
                    speaker_name = record_role_code
                elif record_actor:
                    speaker_name = record_actor
            
            # 格式化：只显示说话者和内容
            formatted_lines.append(f"{speaker_name}: {content}")
        
        if not formatted_lines:
            return "暂无有效的聊天记录。"
        
        return "\n".join(formatted_lines)
    
    def _generate_behavior_insights(self,
                               agent_code: str,
                               agent_profile: Dict[str, Any],
                               records: List[Dict[str, Any]],
                               agent_name: str) -> Dict[str, Any]:
        """使用AI生成行为特点分析"""
        # 格式化聊天记录为可读文本
        chat_records = self._format_chat_records(records, agent_code)
        
        if not self.llm:
            # 如果没有LLM，返回提示信息
            return {
                "analysis": "需要LLM支持才能生成社交行为分析报告。请配置LLM模型。",
            }
        
        try:
            # 构建分析提示（明确指定分析对象）
            prompt = f"""基于以下聊天记录，生成一份关于"{agent_name}"的详细社交行为特点分析报告。

重要：分析对象是"{agent_name}"。请只分析"{agent_name}"的社交行为，不要分析其他参与者的行为。

聊天记录：
{chat_records}

请用中文生成分析报告，包括：
1. 社交活跃度评估（请用"非常活跃"、"活跃"、"中等"或"较低"来评估）
2. 互动风格特点（主动/被动，群体/一对一偏好，请用"主动外向型"、"主动深度型"、"被动社交型"、"被动内敛型"或"平衡型"来描述）
3. 社交目标达成情况
4. 个性特点在社交中的体现

要求：分析要深入、客观，基于实际聊天内容进行分析。不要提及位置、移动等信息。分析对象始终是"{agent_name}"。

请确保在分析中包含对社交活跃度的评估（非常活跃/活跃/中等/较低）和互动风格的描述（主动外向型/主动深度型/被动社交型/被动内敛型/平衡型）。"""
        
            response = self.llm.chat(prompt)
        
            # 直接返回LLM的完整响应
            analysis_text = response.strip()
        
            insights = {
                "analysis": analysis_text,
            }
        
            return insights
        
        except Exception as e:
            print(f"Error generating behavior insights: {e}")
            return {
                "analysis": f"生成社交行为分析时出错：{str(e)}",
            }
    
