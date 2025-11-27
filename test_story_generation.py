#!/usr/bin/env python3
"""测试故事生成功能，检查事件和动机生成是否正常"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from ScrollWeaver import ScrollWeaver
import json

# 读取配置
with open('config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

# 使用"求学"书卷的预设
preset_path = './experiment_presets/user_1_user_1_求学.json'

if not os.path.exists(preset_path):
    print(f"错误：预设文件不存在: {preset_path}")
    sys.exit(1)

print("=" * 60)
print("测试故事生成功能")
print("=" * 60)
print(f"预设文件: {preset_path}")
print(f"世界模型: {config['world_llm_name']}")
print(f"角色模型: {config['role_llm_name']}")
print()

try:
    # 创建ScrollWeaver实例
    print("正在初始化ScrollWeaver...")
    scrollweaver = ScrollWeaver(
        preset_path=preset_path,
        world_llm_name=config["world_llm_name"],
        role_llm_name=config["role_llm_name"],
        embedding_name=config["embedding_model_name"]
    )
    
    scrollweaver.set_generator(
        rounds=config["rounds"],
        save_dir=config["save_dir"],
        if_save=config["if_save"],
        mode=config["mode"],
        scene_mode=config["scene_mode"]
    )
    
    print("初始化成功！")
    print()
    
    # 获取初始数据
    print("=" * 60)
    print("获取初始数据")
    print("=" * 60)
    characters = scrollweaver.get_characters_info(use_selected=False)
    print(f"角色数量: {len(characters)}")
    for char in characters:
        print(f"  - {char.get('name', 'Unknown')} ({char.get('code', 'Unknown')})")
    print()
    
    # 获取当前状态
    status = scrollweaver.get_current_status()
    print(f"当前事件: {status.get('event', 'None')}")
    print(f"当前地点: {status.get('location_code', 'None')}")
    print()
    
    # 测试生成几条消息
    print("=" * 60)
    print("开始生成故事消息（最多10条）")
    print("=" * 60)
    
    message_count = 0
    max_messages = 10
    
    for i in range(max_messages):
        try:
            print(f"\n--- 生成第 {i+1} 条消息 ---")
            message = scrollweaver.generate_next_message()
            
            if message is None:
                print("生成器已结束（返回None）")
                break
            
            message_count += 1
            print(f"消息类型: {message.get('type', 'unknown')}")
            print(f"用户名: {message.get('username', 'unknown')}")
            text = message.get('text', '')
            text_preview = text[:100] if text else 'None'
            print(f"内容预览: {text_preview}...")
            
            # 更新状态
            status = scrollweaver.get_current_status()
            if status.get('event'):
                print(f"当前事件: {status.get('event')[:100]}...")
            
        except StopIteration:
            print("生成器已结束（StopIteration）")
            break
        except Exception as e:
            print(f"生成消息时出错: {e}")
            import traceback
            traceback.print_exc()
            break
    
    print()
    print("=" * 60)
    print(f"测试完成！共生成 {message_count} 条消息")
    print("=" * 60)
    
    # 最终状态
    final_status = scrollweaver.get_current_status()
    print(f"\n最终状态:")
    print(f"  当前事件: {final_status.get('event', 'None')}")
    print(f"  当前地点: {final_status.get('location_code', 'None')}")
    
    # 检查角色动机
    print(f"\n角色动机:")
    for char in characters:
        char_code = char.get('code')
        if char_code and char_code in scrollweaver.server.performers:
            performer = scrollweaver.server.performers[char_code]
            motivation = getattr(performer, 'motivation', '未设置')
            print(f"  {char.get('name')}: {motivation[:100] if motivation else 'None'}...")
    
except Exception as e:
    print(f"测试失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

