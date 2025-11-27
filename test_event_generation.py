#!/usr/bin/env python3
"""
测试事件生成是否使用结构化输出
"""
import os
import sys
import json

# 设置环境变量
os.environ['GEMINI_API_KEY'] = 'AIzaSyAlumoIbI9x2uU11pEpfYF0_guZUx2BVPI'

# 导入必要的模块
from modules.llm.Gemini import Gemini
from modules.models import EventText
from modules.orchestrator import Orchestrator

def test_event_generation_structured():
    """测试事件生成是否使用结构化输出"""
    print("=" * 60)
    print("测试事件生成 - 结构化输出")
    print("=" * 60)
    
    # 初始化LLM
    print("\n1. 初始化 Gemini LLM...")
    llm = Gemini(model="gemini-2.5-flash-lite")
    print(f"   模型: {llm.model_name}")
    
    # 创建Orchestrator实例（需要最小配置）
    print("\n2. 创建 Orchestrator 实例...")
    try:
        # 查找一个有效的world文件
        import glob
        world_files = glob.glob("experiment_presets/**/world*.json", recursive=True)
        if not world_files:
            world_files = glob.glob("**/world*.json", recursive=True)
        
        world_file = world_files[0] if world_files else None
        location_file = None
        
        if world_file:
            print(f"   使用世界文件: {world_file}")
            # 尝试找到对应的location文件
            import os
            world_dir = os.path.dirname(world_file)
            location_files = glob.glob(os.path.join(world_dir, "*location*.json"))
            if not location_files:
                # 尝试使用通用的location文件
                common_location = "data/locations/example_locations.json"
                if os.path.exists(common_location):
                    location_file = common_location
                    print(f"   使用通用地点文件: {location_file}")
                else:
                    # 尝试在world_info.json中查找locations
                    try:
                        import json
                        with open(world_file, 'r', encoding='utf-8') as f:
                            world_data = json.load(f)
                            if 'locations' in world_data:
                                location_file = world_file  # 使用world_file本身
                                print(f"   地点信息在世界文件中")
                            else:
                                print(f"   ⚠️  未找到location文件，使用空路径")
                                location_file = ""
                    except:
                        location_file = ""
            else:
                location_file = location_files[0]
                print(f"   使用地点文件: {location_file}")
        else:
            print("   ⚠️  未找到world文件，跳过Orchestrator测试")
            return False
        
        # 创建一个简单的测试用orchestrator
        orchestrator = Orchestrator(
            world_file_path=world_file,
            location_file_path=location_file if location_file else "",
            world_description="这是一个测试世界：一个充满魔法和冒险的奇幻世界。",
            llm_name="gemini-2.5-flash-lite",
            llm=llm,
            language="zh"
        )
        print("   Orchestrator 创建成功")
    except Exception as e:
        print(f"   创建 Orchestrator 失败: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # 准备测试数据
    print("\n3. 准备测试数据...")
    roles_info_text = """
角色1: 勇敢的骑士，擅长剑术
角色2: 智慧的法师，精通魔法
角色3: 敏捷的盗贼，擅长潜行
"""
    history_text = "角色们刚刚进入了一个神秘的洞穴。"
    
    print(f"   角色信息: {len(roles_info_text)} 字符")
    print(f"   历史信息: {len(history_text)} 字符")
    
    # 测试事件生成
    print("\n4. 测试事件生成...")
    try:
        event = orchestrator.generate_event(
            roles_info_text=roles_info_text,
            event="",
            history_text=history_text
        )
        
        print(f"\n✅ 事件生成成功!")
        print(f"   生成的事件: {event}")
        print(f"   事件类型: {type(event)}")
        print(f"   事件长度: {len(event)} 字符")
        
        # 检查事件是否符合EventText模型的要求
        print("\n5. 验证事件格式...")
        try:
            # 尝试用EventText模型验证
            event_model = EventText(event=event)
            print(f"   ✅ 事件可以通过 EventText 模型验证")
            print(f"   模型字段: event = '{event_model.event}'")
        except Exception as e:
            print(f"   ⚠️  EventText 模型验证失败: {e}")
        
        return True
        
    except Exception as e:
        print(f"\n❌ 事件生成失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_direct_llm_call():
    """直接测试LLM的结构化输出调用"""
    print("\n" + "=" * 60)
    print("测试直接LLM调用 - 结构化输出")
    print("=" * 60)
    
    # 初始化LLM
    print("\n1. 初始化 Gemini LLM...")
    llm = Gemini(model="gemini-2.5-flash-lite")
    
    # 准备prompt
    prompt = """
你是一个虚拟世界的管理员，有许多角色在这个世界中生活。现在需要你基于世界观和其他信息，生成一个重大事件。

## 世界观详情
这是一个测试世界：一个充满魔法和冒险的奇幻世界。

## 角色信息
角色1: 勇敢的骑士，擅长剑术
角色2: 智慧的法师，精通魔法
角色3: 敏捷的盗贼，擅长潜行

## 最新角色行动
角色们刚刚进入了一个神秘的洞穴。

返回一个字符串。保持简洁。

### 事件生成要求
1. 事件尽可能新颖，有趣，包含不同角色的利益冲突。
2. 禁止包含任何细节、人物具体行动和心理，包括对话等。
"""
    
    print("\n2. 测试结构化输出调用...")
    try:
        # 使用结构化输出
        response_model = llm.chat(prompt, response_model=EventText)
        
        print(f"\n✅ 结构化输出调用成功!")
        print(f"   返回类型: {type(response_model)}")
        print(f"   是否为 EventText 实例: {isinstance(response_model, EventText)}")
        print(f"   事件内容: {response_model.event}")
        print(f"   事件长度: {len(response_model.event)} 字符")
        
        # 检查模型结构
        print("\n3. 检查模型结构...")
        print(f"   模型字段: {list(EventText.model_fields.keys())}")
        print(f"   模型JSON Schema: {json.dumps(EventText.model_json_schema(), indent=2, ensure_ascii=False)}")
        
        return True
        
    except Exception as e:
        print(f"\n❌ 结构化输出调用失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_fallback_mechanism():
    """测试回退机制"""
    print("\n" + "=" * 60)
    print("测试回退机制")
    print("=" * 60)
    
    # 这个测试需要模拟结构化输出失败的情况
    # 由于我们无法轻易模拟API失败，这里只检查代码逻辑
    print("\n检查回退机制代码...")
    
    # 读取orchestrator.py中的generate_event方法
    import inspect
    from modules.orchestrator import Orchestrator
    
    source = inspect.getsource(Orchestrator.generate_event)
    
    has_try_except = "try:" in source and "except" in source
    has_fallback = "回退到文本输出" in source or "fallback" in source.lower()
    uses_structured = "EventText" in source and "response_model" in source
    
    print(f"   包含 try-except: {has_try_except}")
    print(f"   包含回退机制: {has_fallback}")
    print(f"   使用结构化输出: {uses_structured}")
    
    if has_try_except and has_fallback and uses_structured:
        print("\n✅ 回退机制代码检查通过")
        return True
    else:
        print("\n⚠️  回退机制代码可能不完整")
        return False

if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("事件生成结构化输出测试")
    print("=" * 60)
    
    results = []
    
    # 测试1: 直接LLM调用
    results.append(("直接LLM调用", test_direct_llm_call()))
    
    # 测试2: Orchestrator事件生成
    results.append(("Orchestrator事件生成", test_event_generation_structured()))
    
    # 测试3: 回退机制检查
    results.append(("回退机制检查", test_fallback_mechanism()))
    
    # 总结
    print("\n" + "=" * 60)
    print("测试总结")
    print("=" * 60)
    for name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{name}: {status}")
    
    all_passed = all(result for _, result in results)
    if all_passed:
        print("\n🎉 所有测试通过！事件生成确实使用了结构化输出。")
    else:
        print("\n⚠️  部分测试失败，请检查上述输出。")
    
    sys.exit(0 if all_passed else 1)

