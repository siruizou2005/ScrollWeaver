"""
社交日报生成模块
总结Agent一天的活动，生成日报格式的报告
"""
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from modules.history_manager import HistoryManager
from modules.social_story_generator import SocialStoryGenerator


class DailyReportGenerator:
    """
    日报生成器
    生成Agent的每日社交活动报告
    """
    
    def __init__(self, history_manager: HistoryManager, language: str = "zh"):
        """
        初始化日报生成器
        
        Args:
            history_manager: 历史管理器
            language: 语言设置
        """
        self.history_manager = history_manager
        self.language = language
        self.story_generator = SocialStoryGenerator(history_manager, language)
    
    def generate_daily_report(self, 
                             agent_code: str,
                             date: Optional[datetime] = None) -> Dict[str, Any]:
        """
        生成指定日期的日报
        
        Args:
            agent_code: Agent代码
            date: 日期（如果为None，使用最新记录的日期）
        
        Returns:
            日报字典
        """
        # 确定日期范围
        if date is None:
            # 使用最新记录的日期
            if self.history_manager.detailed_history:
                latest_record = self.history_manager.detailed_history[-1]
                if "virtual_timestamp" in latest_record:
                    date = datetime.fromtimestamp(latest_record["virtual_timestamp"])
                else:
                    date = datetime.now()
            else:
                date = datetime.now()
        
        # 计算一天的开始和结束时间
        start_time = date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(days=1)
        
        # 获取当天的故事
        story_info = self.story_generator.get_agent_story(agent_code, start_time, end_time)
        
        # 生成日报内容
        report = {
            "date": date.strftime("%Y-%m-%d"),
            "agent_code": agent_code,
            "summary": self._generate_summary(story_info),
            "highlights": self._generate_highlights(story_info),
            "interactions": self._extract_interactions(story_info),
            "mood_changes": self._analyze_mood_changes(story_info),
            "goals_progress": self._analyze_goals_progress(story_info),
            "stats": story_info.get("stats", {}),
            "full_story": story_info.get("story_text", "")
        }
        
        return report
    
    def _generate_summary(self, story_info: Dict[str, Any]) -> str:
        """
        生成摘要
        
        Args:
            story_info: 故事信息
        
        Returns:
            摘要文本
        """
        stats = story_info.get("stats", {})
        total_interactions = stats.get("total_interactions", 0)
        unique_contacts = stats.get("unique_contacts_count", 0)
        total_movements = stats.get("total_movements", 0)
        
        if self.language == "zh":
            summary = f"今天共进行了{total_interactions}次社交互动，"
            summary += f"与{unique_contacts}位不同的朋友交流，"
            summary += f"移动了{total_movements}次。"
            
            if total_interactions == 0:
                summary = "今天比较安静，没有太多社交活动。"
        else:
            summary = f"Today had {total_interactions} social interactions, "
            summary += f"communicated with {unique_contacts} different friends, "
            summary += f"and moved {total_movements} times."
            
            if total_interactions == 0:
                summary = "Today was quiet with not much social activity."
        
        return summary
    
    def _generate_highlights(self, story_info: Dict[str, Any]) -> List[str]:
        """
        生成亮点事件
        
        Args:
            story_info: 故事信息
        
        Returns:
            亮点列表
        """
        highlights = []
        key_events = story_info.get("key_events", [])
        
        # 选择最重要的几个事件
        interaction_events = [e for e in key_events if e.get("type") == "interaction"]
        
        # 取最近的几个互动作为亮点
        for event in interaction_events[-3:]:
            detail = event.get("detail", "")
            if detail:
                highlights.append(detail[:100] + "..." if len(detail) > 100 else detail)
        
        return highlights
    
    def _extract_interactions(self, story_info: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        提取互动信息
        
        Args:
            story_info: 故事信息
        
        Returns:
            互动列表
        """
        interactions = []
        key_events = story_info.get("key_events", [])
        
        for event in key_events:
            if event.get("type") == "interaction":
                interactions.append({
                    "time": event.get("time", ""),
                    "detail": event.get("detail", ""),
                    "participants": event.get("participants", [])
                })
        
        return interactions
    
    def _analyze_mood_changes(self, story_info: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        分析情感变化（简化版，实际可以使用更复杂的NLP分析）
        
        Args:
            story_info: 故事信息
        
        Returns:
            情感变化列表
        """
        # 这是一个简化版本，实际可以使用情感分析模型
        mood_changes = []
        
        # 基于互动数量推断情感
        stats = story_info.get("stats", {})
        total_interactions = stats.get("total_interactions", 0)
        
        if total_interactions > 5:
            mood = "积极" if self.language == "zh" else "Positive"
        elif total_interactions > 2:
            mood = "平静" if self.language == "zh" else "Calm"
        else:
            mood = "安静" if self.language == "zh" else "Quiet"
        
        mood_changes.append({
            "time": "全天",
            "mood": mood,
            "description": f"今天进行了{total_interactions}次互动" if self.language == "zh" else f"Had {total_interactions} interactions today"
        })
        
        return mood_changes
    
    def _analyze_goals_progress(self, story_info: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        分析目标进展
        
        Args:
            story_info: 故事信息
        
        Returns:
            目标进展列表
        """
        goals_progress = []
        key_events = story_info.get("key_events", [])
        
        # 查找目标设定事件
        for event in key_events:
            if event.get("type") == "goal":
                goals_progress.append({
                    "goal": event.get("detail", ""),
                    "status": "进行中" if self.language == "zh" else "In Progress"
                })
        
        return goals_progress
    
    def generate_report_text(self, report: Dict[str, Any]) -> str:
        """
        将日报转换为文本格式
        
        Args:
            report: 日报字典
        
        Returns:
            文本格式的日报
        """
        if self.language == "zh":
            text = f"=== {report['date']} 社交日报 ===\n\n"
            text += f"Agent: {report['agent_code']}\n\n"
            text += f"【摘要】\n{report['summary']}\n\n"
            
            if report.get('highlights'):
                text += "【今日亮点】\n"
                for i, highlight in enumerate(report['highlights'], 1):
                    text += f"{i}. {highlight}\n"
                text += "\n"
            
            if report.get('interactions'):
                text += f"【互动记录】共{len(report['interactions'])}次\n"
                for interaction in report['interactions'][-5:]:  # 只显示最近5次
                    text += f"- {interaction['time']}: {interaction['detail'][:80]}...\n"
                text += "\n"
            
            if report.get('stats'):
                stats = report['stats']
                text += f"【统计信息】\n"
                text += f"- 总互动次数: {stats.get('total_interactions', 0)}\n"
                text += f"- 接触的朋友数: {stats.get('unique_contacts_count', 0)}\n"
                text += f"- 移动次数: {stats.get('total_movements', 0)}\n"
        else:
            text = f"=== Daily Social Report for {report['date']} ===\n\n"
            text += f"Agent: {report['agent_code']}\n\n"
            text += f"【Summary】\n{report['summary']}\n\n"
            
            if report.get('highlights'):
                text += "【Highlights】\n"
                for i, highlight in enumerate(report['highlights'], 1):
                    text += f"{i}. {highlight}\n"
                text += "\n"
            
            if report.get('interactions'):
                text += f"【Interactions】Total: {len(report['interactions'])}\n"
                for interaction in report['interactions'][-5:]:
                    text += f"- {interaction['time']}: {interaction['detail'][:80]}...\n"
                text += "\n"
            
            if report.get('stats'):
                stats = report['stats']
                text += f"【Statistics】\n"
                text += f"- Total Interactions: {stats.get('total_interactions', 0)}\n"
                text += f"- Unique Contacts: {stats.get('unique_contacts_count', 0)}\n"
                text += f"- Movements: {stats.get('total_movements', 0)}\n"
        
        return text


def generate_daily_report(history_manager: HistoryManager,
                         agent_code: str,
                         date: Optional[datetime] = None,
                         language: str = "zh") -> Dict[str, Any]:
    """
    生成日报的便捷函数
    
    Args:
        history_manager: 历史管理器
        agent_code: Agent代码
        date: 日期
        language: 语言设置
    
    Returns:
        日报字典
    """
    generator = DailyReportGenerator(history_manager, language)
    return generator.generate_daily_report(agent_code, date)

