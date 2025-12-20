"""
Soulverse专用模式
将系统从剧本模式转换为社交沙盒模式
"""
from typing import Dict, List, Any, Optional
from datetime import datetime


class SoulverseMode:
    """
    Soulverse社交沙盒模式
    与剧本模式不同，专注于用户Agent的自主社交
    """
    
    def __init__(self, language: str = "zh"):
        self.language = language
        self.is_soulverse_mode = True
    
    def generate_social_event(self, 
                            agents_info: List[Dict[str, Any]],
                            recent_activities: List[str]) -> str:
        """
        生成社交场景事件（而不是剧本事件）
        
        Args:
            agents_info: Agent信息列表
            recent_activities: 最近的活动记录
        
        Returns:
            社交场景事件描述
        """
        if self.language == "zh":
            # 基于Agent的兴趣和活动生成社交场景
            event_templates = [
                "今天是一个普通的社交日，Agent们在各个场景中自由探索和互动。",
                "咖啡馆里正在举办一场读书分享会，吸引了喜欢阅读的Agent们。",
                "音乐厅今晚有现场演出，音乐爱好者们聚集在这里。",
                "公园里阳光明媚，适合户外活动和运动。",
                "图书馆里安静而专注，喜欢深度交流的Agent们在这里相遇。",
                "艺术画廊正在举办新展览，艺术爱好者们前来欣赏。",
                "中央广场有社交活动，吸引了想要拓展社交圈子的Agent们。"
            ]
            
            # 根据Agent的兴趣动态生成
            interests = []
            for agent in agents_info:
                if hasattr(agent, 'get_soul_interests'):
                    interests.extend(agent.get_soul_interests())
            
            if "电影" in interests or "阅读" in interests:
                return "今天有电影放映和读书分享活动，喜欢电影和阅读的Agent们可以参与。"
            elif "音乐" in interests:
                return "音乐厅有现场演出，音乐爱好者们可以在这里相遇和交流。"
            elif "运动" in interests or "健身" in interests:
                return "公园和健身中心都很活跃，运动爱好者们可以一起锻炼。"
            else:
                import random
                return random.choice(event_templates)
        else:
            return "A normal social day in Soulverse, agents are exploring and interacting freely."
    
    def generate_social_motivation(self,
                                  agent_profile: str,
                                  social_goals: List[str],
                                  world_description: str,
                                  other_agents_info: Dict[str, Any],
                                  current_location: str) -> str:
        """
        基于社交目标生成motivation（而不是剧本motivation）
        
        Args:
            agent_profile: Agent的profile
            social_goals: 社交目标列表
            world_description: 世界描述
            other_agents_info: 其他Agent信息
            current_location: 当前位置
        
        Returns:
            motivation描述
        """
        if self.language == "zh":
            goals_text = "、".join(social_goals) if social_goals else "寻找志同道合的朋友"
            
            motivation = f"""你是一个在Soulverse虚拟社交沙盒中的AI Agent。你的目标是：{goals_text}。

你当前在{current_location}。这里可能有其他Agent，你可以：
1. 观察周围的环境和其他Agent
2. 主动与其他Agent交流，了解他们的兴趣和性格
3. 分享自己的兴趣和想法
4. 如果聊得来，可以约定下次见面或一起参与活动
5. 如果当前场景不适合，可以移动到其他场景寻找机会

记住：你的目标是建立真实的社交关系，寻找志同道合的朋友。保持自然、友好、真诚的交流方式。"""
            
            return motivation
        else:
            goals_text = ", ".join(social_goals) if social_goals else "find like-minded friends"
            return f"You are an AI Agent in Soulverse social sandbox. Your goal is to: {goals_text}. You are currently at {current_location}. You can observe, interact with other agents, and build genuine social connections."
    
    def should_continue_simulation(self, 
                                   history: List[str],
                                   max_idle_rounds: int = 5) -> bool:
        """
        判断是否应该继续模拟（社交沙盒应该持续运行）
        
        Args:
            history: 历史记录
            max_idle_rounds: 最大空闲轮次
        
        Returns:
            是否继续
        """
        # 社交沙盒模式应该持续运行，除非所有Agent都长时间没有活动
        if len(history) < 10:
            return True
        
        # 检查最近是否有活动
        recent_activity = any("互动" in h or "对话" in h or "交流" in h for h in history[-max_idle_rounds:])
        return recent_activity or len(history) < 50  # 至少运行一定轮次
    
    def generate_daily_summary_prompt(self, agent_code: str, daily_activities: List[str]) -> str:
        """
        生成日报总结的prompt
        
        Args:
            agent_code: Agent代码
            daily_activities: 一天的活动记录
        
        Returns:
            prompt文本
        """
        activities_text = "\n".join(daily_activities)
        
        if self.language == "zh":
            return f"""请为Agent {agent_code}生成一份社交日报总结。

## 今日活动记录
{activities_text}

## 要求
1. 总结今天的主要社交互动
2. 列出遇到的新朋友
3. 描述情感变化和收获
4. 展望明天的社交计划

用自然、友好的语言，像朋友之间的分享一样。"""
        else:
            return f"""Generate a daily social report for Agent {agent_code}.

## Today's Activities
{activities_text}

## Requirements
1. Summarize main social interactions
2. List new friends met
3. Describe emotional changes and gains
4. Plan for tomorrow's social activities"""

