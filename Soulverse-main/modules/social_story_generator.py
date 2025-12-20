"""
社交故事生成器
将Agent互动转换为故事叙述，用于观察者模式
"""
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from modules.history_manager import HistoryManager


class SocialStoryGenerator:
    """
    社交故事生成器
    将Agent的历史记录转换为可读的社交故事
    """
    
    def __init__(self, history_manager: HistoryManager, language: str = "zh"):
        """
        初始化社交故事生成器
        
        Args:
            history_manager: 历史管理器
            language: 语言设置
        """
        self.history_manager = history_manager
        self.language = language
    
    def get_agent_story(self, 
                       agent_code: str,
                       start_time: Optional[datetime] = None,
                       end_time: Optional[datetime] = None,
                       max_events: int = 50) -> Dict[str, Any]:
        """
        获取指定Agent的社交故事
        
        Args:
            agent_code: Agent代码
            start_time: 开始时间（虚拟时间）
            end_time: 结束时间（虚拟时间）
            max_events: 最大事件数量
        
        Returns:
            包含故事信息的字典
        """
        # 筛选相关记录
        relevant_records = self._filter_records(agent_code, start_time, end_time)
        
        # 限制事件数量
        if len(relevant_records) > max_events:
            relevant_records = relevant_records[-max_events:]
        
        # 生成故事文本
        story_text = self._generate_story_text(relevant_records, agent_code)
        
        # 提取关键信息
        key_events = self._extract_key_events(relevant_records, agent_code)
        
        # 统计信息
        stats = self._calculate_stats(relevant_records, agent_code)
        
        return {
            "agent_code": agent_code,
            "story_text": story_text,
            "key_events": key_events,
            "stats": stats,
            "time_range": {
                "start": start_time.strftime("%Y-%m-%d %H:%M:%S") if start_time else None,
                "end": end_time.strftime("%Y-%m-%d %H:%M:%S") if end_time else None
            },
            "total_events": len(relevant_records)
        }
    
    def _filter_records(self, 
                       agent_code: str,
                       start_time: Optional[datetime] = None,
                       end_time: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """
        筛选相关记录
        
        Args:
            agent_code: Agent代码
            start_time: 开始时间
            end_time: 结束时间
        
        Returns:
            筛选后的记录列表
        """
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
    
    def _generate_story_text(self, records: List[Dict[str, Any]], agent_code: str) -> str:
        """
        生成故事文本
        
        Args:
            records: 记录列表
            agent_code: Agent代码
        
        Returns:
            故事文本
        """
        if not records:
            return "暂无社交活动记录。" if self.language == "zh" else "No social activity records."
        
        story_lines = []
        
        for record in records:
            virtual_time = record.get("virtual_time", "")
            detail = record.get("detail", "")
            act_type = record.get("act_type", record.get("type", ""))
            
            # 根据活动类型格式化
            if act_type == "plan":
                story_lines.append(f"[{virtual_time}] {detail}")
            elif act_type == "single":
                story_lines.append(f"[{virtual_time}] {detail}")
            elif act_type == "multi":
                story_lines.append(f"[{virtual_time}] {detail}")
            elif act_type == "move":
                story_lines.append(f"[{virtual_time}] {detail}")
            else:
                story_lines.append(f"[{virtual_time}] {detail}")
        
        return "\n".join(story_lines)
    
    def _extract_key_events(self, records: List[Dict[str, Any]], agent_code: str) -> List[Dict[str, Any]]:
        """
        提取关键事件
        
        Args:
            records: 记录列表
            agent_code: Agent代码
        
        Returns:
            关键事件列表
        """
        key_events = []
        
        # 排除的记录类型（这些不应该作为关键事件）
        excluded_types = ["user_input_placeholder", "plan", "npc", "enviroment"]
        
        for record in records:
            act_type = record.get("act_type", record.get("type", ""))
            
            # 跳过排除的类型
            if act_type in excluded_types:
                continue
            
            # 识别关键事件类型
            if act_type in ["single", "multi"]:
                # 社交互动
                detail = record.get("detail", "")
                # 排除占位符
                if detail and detail != "__USER_INPUT_PLACEHOLDER__":
                    key_events.append({
                        "type": "interaction",
                        "time": record.get("virtual_time", ""),
                        "detail": detail,
                        "participants": record.get("group", [])
                    })
            elif act_type == "move":
                # 位置移动
                detail = record.get("detail", "")
                if detail:
                    key_events.append({
                        "type": "movement",
                        "time": record.get("virtual_time", ""),
                        "detail": detail
                    })
            elif act_type == "goal setting":
                # 目标设定
                detail = record.get("detail", "")
                if detail:
                    key_events.append({
                        "type": "goal",
                        "time": record.get("virtual_time", ""),
                        "detail": detail
                    })
        
        return key_events
    
    def _calculate_stats(self, records: List[Dict[str, Any]], agent_code: str) -> Dict[str, Any]:
        """
        计算统计信息
        
        Args:
            records: 记录列表
            agent_code: Agent代码
        
        Returns:
            统计信息字典
        """
        stats = {
            "total_interactions": 0,
            "total_movements": 0,
            "unique_contacts": set(),
            "interaction_types": {}
        }
        
        # 排除的记录类型（这些不应该被统计为互动或移动）
        # 注意：user_input 现在被包含在互动统计中，以支持1对1聊天模式
        excluded_types = ["user_input_placeholder", "goal setting", "plan", "npc", "enviroment"]
        
        for record in records:
            act_type = record.get("act_type", record.get("type", ""))
            
            # 跳过排除的类型
            if act_type in excluded_types:
                continue
            
            # 统计互动（包括single, multi, 和 user_input）
            if act_type in ["single", "multi", "user_input"]:
                stats["total_interactions"] += 1
                # 记录互动对象
                group = record.get("group", [])
                if group:  # 确保group不为空
                    for member in group:
                        if member and member != agent_code:  # 确保member不为空且不是自己
                            stats["unique_contacts"].add(member)
                
                # 统计互动类型
                if act_type not in stats["interaction_types"]:
                    stats["interaction_types"][act_type] = 0
                stats["interaction_types"][act_type] += 1
            
            elif act_type == "move":
                stats["total_movements"] += 1
        
        # 转换set为list以便JSON序列化
        stats["unique_contacts"] = list(stats["unique_contacts"])
        stats["unique_contacts_count"] = len(stats["unique_contacts"])
        
        return stats
    
    def get_recent_story(self, agent_code: str, hours: int = 24) -> Dict[str, Any]:
        """
        获取最近N小时的社交故事
        
        Args:
            agent_code: Agent代码
            hours: 小时数
        
        Returns:
            故事信息字典
        """
        # 计算时间范围
        if self.history_manager.detailed_history:
            latest_record = self.history_manager.detailed_history[-1]
            if "virtual_timestamp" in latest_record:
                end_time = datetime.fromtimestamp(latest_record["virtual_timestamp"])
                start_time = end_time - timedelta(hours=hours)
                return self.get_agent_story(agent_code, start_time, end_time)
        
        return self.get_agent_story(agent_code)


def generate_social_story(history_manager: HistoryManager,
                         agent_code: str,
                         language: str = "zh",
                         time_range_hours: Optional[int] = None) -> Dict[str, Any]:
    """
    生成社交故事的便捷函数
    
    Args:
        history_manager: 历史管理器
        agent_code: Agent代码
        language: 语言设置
        time_range_hours: 时间范围（小时）
    
    Returns:
        故事信息字典
    """
    generator = SocialStoryGenerator(history_manager, language)
    
    if time_range_hours:
        return generator.get_recent_story(agent_code, time_range_hours)
    else:
        return generator.get_agent_story(agent_code)

