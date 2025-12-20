"""
初始化预设NPC Agent脚本
使用新的三层人格模型格式创建所有预设Agent
"""
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from modules.preset_agents import PresetAgents
from modules.npc_agent import NPCAgent
from sw_utils import load_json_file


def init_preset_npcs(world_file_path: str, 
                    language: str = "zh",
                    db_type: str = "chroma",
                    llm_name: str = "gpt-4o-mini",
                    embedding_name: str = "bge-small"):
    """
    初始化所有预设NPC Agent
    
    Args:
        world_file_path: 世界设定文件路径
        language: 语言设置
        db_type: 数据库类型
        llm_name: LLM模型名称
        embedding_name: 嵌入模型名称
    
    Returns:
        创建的Agent列表
    """
    # 获取所有预设模板
    preset_templates = PresetAgents.get_preset_templates()
    
    created_agents = []
    
    for preset_template in preset_templates:
        preset_id = preset_template["id"]
        role_name = preset_template["name"]
        role_code = f"npc_{preset_id}"
        
        try:
            # 使用新的三层人格模型格式创建NPC Agent
            npc_agent = NPCAgent(
                role_code=role_code,
                role_name=role_name,
                world_file_path=world_file_path,
                preset_id=preset_id,  # 使用preset_id，自动生成PersonalityProfile
                language=language,
                db_type=db_type,
                llm_name=llm_name,
                llm=None,
                embedding_name=embedding_name,
                embedding=None
            )
            
            created_agents.append({
                "role_code": role_code,
                "role_name": role_name,
                "preset_id": preset_id,
                "agent": npc_agent
            })
            
            print(f"✓ 成功创建预设NPC: {role_name} ({role_code})")
            print(f"  - MBTI: {npc_agent.personality_profile.core_traits.mbti}")
            print(f"  - Big Five: {npc_agent.personality_profile.core_traits.big_five}")
            print(f"  - 兴趣: {', '.join(npc_agent.personality_profile.interests[:3])}...")
            print()
            
        except Exception as e:
            print(f"✗ 创建预设NPC失败 {preset_id}: {e}")
            import traceback
            traceback.print_exc()
    
    return created_agents


if __name__ == "__main__":
    # 默认配置
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    world_file_path = os.path.join(base_dir, "data", "worlds", "soulverse_sandbox", "general.json")
    
    if not os.path.exists(world_file_path):
        print(f"错误: 找不到世界设定文件: {world_file_path}")
        sys.exit(1)
    
    print("=" * 60)
    print("初始化预设NPC Agent（使用三层人格模型）")
    print("=" * 60)
    print()
    
    agents = init_preset_npcs(
        world_file_path=world_file_path,
        language="zh",
        db_type="chroma",
        llm_name="gpt-4o-mini",
        embedding_name="bge-small"
    )
    
    print("=" * 60)
    print(f"完成！共创建 {len(agents)} 个预设NPC Agent")
    print("=" * 60)

