"""
测试动机生成系统 - 批量生成功能
"""
import os
import sys

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 设置环境变量（从 config.json 读取）
try:
    from sw_utils import load_json_file
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
    if os.path.exists(config_path):
        config = load_json_file(config_path)
        if config.get("GEMINI_API_KEY"):
            os.environ["GEMINI_API_KEY"] = config["GEMINI_API_KEY"]
            print(f"[测试] 已从 config.json 加载 GEMINI_API_KEY")
except Exception as e:
    print(f"[测试] 加载配置失败: {e}")

from modules.utils.motivation_generator import MotivationGenerator


def test_batch_generation():
    """测试批量生成动机功能"""
    
    print("=" * 60)
    print("测试动机生成系统 - 批量生成功能")
    print("=" * 60)
    
    # 初始化生成器
    generator = MotivationGenerator(llm_name="gemini-2.5-flash")
    
    # 测试数据：模拟三个角色
    test_characters = [
        {
            "role_name": "林朝夕",
            "profile": "林朝夕是一个聪明、坚韧的女孩，在父亲确诊阿尔茨海默病后，她决定重新学习数学，希望通过自己的努力帮助父亲找回记忆。她性格坚强，面对困难从不退缩。"
        },
        {
            "role_name": "老林",
            "profile": "老林是林朝夕的父亲，一位数学天才，但不幸患上了阿尔茨海默病。他深爱着女儿，即使在记忆逐渐消失的过程中，仍然保持着对数学的热爱和对女儿的关怀。"
        },
        {
            "role_name": "裴之",
            "profile": "裴之是林朝夕的同学，数学天才，聪明、冷静、理性。他对数学有着极高的天赋和热情，是林朝夕在数学学习路上的重要伙伴和竞争对手。"
        }
    ]
    
    world_description = """这是一个现实世界，讲述了林朝夕在父亲确诊阿尔茨海默病后，面对人生选择和挑战的故事。故事围绕数学学习、家庭关系、个人成长展开，展现了年轻人在面对困难时的坚韧和成长。"""
    
    print(f"\n准备为 {len(test_characters)} 个角色批量生成动机...")
    print(f"角色列表: {[char['role_name'] for char in test_characters]}")
    print(f"\n世界观描述: {world_description[:100]}...")
    
    try:
        # 执行批量生成
        results = generator.generate_batch_motivations(
            characters=test_characters,
            world_description=world_description,
            language="zh"
        )
        
        print("\n" + "=" * 60)
        print("批量生成结果:")
        print("=" * 60)
        
        for role_name, motivation in results.items():
            print(f"\n【{role_name}】")
            print(f"动机: {motivation}")
            print(f"长度: {len(motivation)} 字符 (要求: ≤100字)")
            if len(motivation) > 100:
                print(f"⚠️  警告: 动机长度超过100字！")
            print("-" * 60)
        
        print(f"\n✅ 批量生成成功！共生成 {len(results)} 个角色的动机")
        
        # 验证结果
        assert len(results) == len(test_characters), f"生成的角色数量不匹配: 期望 {len(test_characters)}, 实际 {len(results)}"
        
        for char in test_characters:
            assert char["role_name"] in results, f"角色 {char['role_name']} 的动机未生成"
            assert results[char["role_name"]], f"角色 {char['role_name']} 的动机为空"
            motivation_length = len(results[char["role_name"]])
            assert motivation_length > 20, f"角色 {char['role_name']} 的动机过短（{motivation_length}字）"
            assert motivation_length <= 100, f"角色 {char['role_name']} 的动机过长（{motivation_length}字，要求≤100字）"
        
        print("\n✅ 所有验证通过！")
        return True
        
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_file_based_generation():
    """测试基于文件的批量生成"""
    
    print("\n" + "=" * 60)
    print("测试基于文件的批量生成功能")
    print("=" * 60)
    
    # 这里需要根据实际的项目结构调整路径
    # 示例路径（需要根据实际情况修改）
    role_file_dir = "./data/roles/"
    world_file_path = "./data/worlds/user_1_天才基本法/general.json"
    source = "user_1_天才基本法"
    
    # 检查文件是否存在
    if not os.path.exists(world_file_path):
        print(f"⚠️  世界观文件不存在: {world_file_path}")
        print("跳过文件测试")
        return False
    
    generator = MotivationGenerator(llm_name="gemini-2.5-flash")
    
    try:
        print(f"\n从文件批量生成动机...")
        print(f"角色目录: {role_file_dir}")
        print(f"世界观文件: {world_file_path}")
        print(f"源: {source}")
        
        results = generator.generate_batch(
            role_file_dir=role_file_dir,
            world_file_path=world_file_path,
            source=source,
            language="zh"
        )
        
        print("\n" + "=" * 60)
        print("批量生成结果:")
        print("=" * 60)
        
        success_count = sum(1 for v in results.values() if v)
        print(f"\n成功: {success_count}/{len(results)}")
        
        for role_code, success in results.items():
            status = "✅" if success else "❌"
            print(f"{status} {role_code}")
        
        print(f"\n✅ 文件批量生成完成！")
        return True
        
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("\n开始测试动机生成系统...\n")
    
    # 测试1: 直接批量生成
    test1_result = test_batch_generation()
    
    # 测试2: 基于文件的批量生成（可选）
    # test2_result = test_file_based_generation()
    
    print("\n" + "=" * 60)
    if test1_result:
        print("✅ 所有测试通过！")
    else:
        print("❌ 部分测试失败")
    print("=" * 60)

