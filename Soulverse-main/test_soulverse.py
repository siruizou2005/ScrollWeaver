"""
Soulverse测试脚本
测试用户Agent创建和社交互动
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from ScrollWeaver import ScrollWeaver
from modules.soul_api_mock import get_soul_profile
import json


def test_create_user_agents():
    """测试1：创建多个用户Agent"""
    print("=" * 60)
    print("测试1：创建用户Agent")
    print("=" * 60)
    
    # 使用Soulverse预设
    preset_path = "./experiment_presets/soulverse_sandbox.json"
    
    scrollweaver = ScrollWeaver(
        preset_path=preset_path,
        world_llm_name="gpt-4o-mini",
        role_llm_name="gpt-4o-mini",
        embedding_name="bge-small"
    )
    
    # 创建第一个用户Agent
    print("\n创建用户Agent 1...")
    user1_profile = get_soul_profile(user_id="user_001", interests=["电影", "音乐", "阅读"], mbti="ENFP")
    agent1 = scrollweaver.server.add_user_agent(
        user_id="user_001",
        role_code="agent_user001",
        soul_profile=user1_profile
    )
    print(f"✓ Agent 1 创建成功: {agent1.nickname}")
    print(f"  兴趣: {', '.join(user1_profile['interests'])}")
    print(f"  MBTI: {user1_profile['mbti']}")
    print(f"  位置: {agent1.location_name}")
    
    # 创建第二个用户Agent
    print("\n创建用户Agent 2...")
    user2_profile = get_soul_profile(user_id="user_002", interests=["运动", "旅行", "摄影"], mbti="ISTJ")
    agent2 = scrollweaver.server.add_user_agent(
        user_id="user_002",
        role_code="agent_user002",
        soul_profile=user2_profile
    )
    print(f"✓ Agent 2 创建成功: {agent2.nickname}")
    print(f"  兴趣: {', '.join(user2_profile['interests'])}")
    print(f"  MBTI: {user2_profile['mbti']}")
    print(f"  位置: {agent2.location_name}")
    
    # 创建第三个用户Agent
    print("\n创建用户Agent 3...")
    user3_profile = get_soul_profile(user_id="user_003", interests=["音乐", "艺术", "咖啡"], mbti="INFP")
    agent3 = scrollweaver.server.add_user_agent(
        user_id="user_003",
        role_code="agent_user003",
        soul_profile=user3_profile
    )
    print(f"✓ Agent 3 创建成功: {agent3.nickname}")
    print(f"  兴趣: {', '.join(user3_profile['interests'])}")
    print(f"  MBTI: {user3_profile['mbti']}")
    print(f"  位置: {agent3.location_name}")
    
    return scrollweaver


def test_social_simulation(scrollweaver, max_rounds=5):
    """测试2：运行社交模拟"""
    print("\n" + "=" * 60)
    print("测试2：运行社交模拟")
    print("=" * 60)
    
    # 设置生成器
    scrollweaver.set_generator(
        rounds=max_rounds,
        save_dir="",
        if_save=0,
        mode="free",
        scene_mode=1
    )
    
    print(f"\n开始模拟（最多{max_rounds}轮）...")
    print("-" * 60)
    
    interaction_count = 0
    for i in range(max_rounds * 3):  # 每轮可能有多个子轮
        try:
            message = scrollweaver.generate_next_message()
            if message:
                msg_type = message['type']
                username = message['username']
                text = message['text'][:100] + "..." if len(message['text']) > 100 else message['text']
                
                if msg_type == 'role':
                    interaction_count += 1
                    print(f"[{msg_type}] {username}: {text}")
                elif msg_type == 'system':
                    print(f"[{msg_type}] {text}")
                elif msg_type == 'world':
                    print(f"[{msg_type}] {text[:80]}...")
        except StopIteration:
            print("\n模拟结束")
            break
        except Exception as e:
            print(f"\n错误: {e}")
            break
    
    print(f"\n✓ 模拟完成，共生成 {interaction_count} 条互动消息")
    return scrollweaver


def test_social_story(scrollweaver, agent_code):
    """测试3：生成社交故事"""
    print("\n" + "=" * 60)
    print(f"测试3：生成Agent {agent_code} 的社交故事")
    print("=" * 60)
    
    from modules.social_story_generator import generate_social_story
    
    story_info = generate_social_story(
        history_manager=scrollweaver.server.history_manager,
        agent_code=agent_code,
        language="zh",
        time_range_hours=24
    )
    
    print(f"\n社交故事统计:")
    print(f"  总事件数: {story_info['total_events']}")
    print(f"  互动次数: {story_info['stats']['total_interactions']}")
    print(f"  接触的朋友: {story_info['stats']['unique_contacts_count']}")
    print(f"  移动次数: {story_info['stats']['total_movements']}")
    
    if story_info['key_events']:
        print(f"\n关键事件:")
        for event in story_info['key_events'][:5]:
            print(f"  - [{event['time']}] {event['type']}: {event['detail'][:60]}...")
    
    return story_info


def test_daily_report(scrollweaver, agent_code):
    """测试4：生成日报"""
    print("\n" + "=" * 60)
    print(f"测试4：生成Agent {agent_code} 的日报")
    print("=" * 60)
    
    from modules.daily_report import generate_daily_report
    
    report = generate_daily_report(
        history_manager=scrollweaver.server.history_manager,
        agent_code=agent_code,
        date=None,
        language="zh"
    )
    
    print(f"\n日报摘要:")
    print(report['summary'])
    
    if report['highlights']:
        print(f"\n亮点:")
        for i, highlight in enumerate(report['highlights'], 1):
            print(f"  {i}. {highlight[:80]}...")
    
    return report


if __name__ == "__main__":
    print("Soulverse 测试开始")
    print("=" * 60)
    
    try:
        # 测试1：创建Agent
        scrollweaver = test_create_user_agents()
        
        # 测试2：运行模拟
        scrollweaver = test_social_simulation(scrollweaver, max_rounds=3)
        
        # 测试3：生成社交故事
        if "agent_user001" in scrollweaver.server.role_codes:
            test_social_story(scrollweaver, "agent_user001")
        
        # 测试4：生成日报
        if "agent_user001" in scrollweaver.server.role_codes:
            test_daily_report(scrollweaver, "agent_user001")
        
        print("\n" + "=" * 60)
        print("所有测试完成！")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n测试失败: {e}")
        import traceback
        traceback.print_exc()

