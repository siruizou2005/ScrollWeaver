#!/usr/bin/env python3
"""修复书卷ID=12的角色代码问题"""
import json
import os
import re
import sqlite3

# 读取预设文件
preset_file = './experiment_presets/user_1_user_1_求学.json'
if not os.path.exists(preset_file):
    print(f"预设文件不存在: {preset_file}")
    exit(1)

with open(preset_file, 'r', encoding='utf-8') as f:
    preset = json.load(f)

source_name = preset['source']
roles_dir = f"./data/roles/{source_name}"

# 查找所有角色文件
performer_codes = []
if os.path.exists(roles_dir):
    # 检查是否有直接的角色文件（错误的格式）
    role_info_file = os.path.join(roles_dir, 'role_info.json')
    if os.path.exists(role_info_file):
        with open(role_info_file, 'r', encoding='utf-8') as f:
            role_info = json.load(f)
        role_name = role_info.get('role_name', '')
        if role_name:
            # 生成代码
            char_code = re.sub(r'[^\w\s-]', '', role_name.lower())
            char_code = re.sub(r'[-\s]+', '_', char_code)
            
            # 创建正确的目录结构
            char_dir = os.path.join(roles_dir, char_code)
            os.makedirs(char_dir, exist_ok=True)
            
            # 移动文件到正确的目录
            new_role_info_file = os.path.join(char_dir, 'role_info.json')
            role_info['role_code'] = char_code
            with open(new_role_info_file, 'w', encoding='utf-8') as f:
                json.dump(role_info, f, ensure_ascii=False, indent=2)
            
            performer_codes.append(char_code)
            print(f"修复角色: {role_name} -> {char_code}")
            
            # 删除旧文件
            if os.path.exists(role_info_file) and role_info_file != new_role_info_file:
                os.remove(role_info_file)
    
    # 检查子目录中的角色文件
    for item in os.listdir(roles_dir):
        item_path = os.path.join(roles_dir, item)
        if os.path.isdir(item_path):
            role_info_file = os.path.join(item_path, 'role_info.json')
            if os.path.exists(role_info_file):
                with open(role_info_file, 'r', encoding='utf-8') as f:
                    role_info = json.load(f)
                role_code = role_info.get('role_code', '').strip()
                role_name = role_info.get('role_name', '')
                
                if not role_code and role_name:
                    # 生成代码
                    char_code = re.sub(r'[^\w\s-]', '', role_name.lower())
                    char_code = re.sub(r'[-\s]+', '_', char_code)
                    
                    # 如果目录名不对，需要重命名
                    if item != char_code:
                        new_dir = os.path.join(roles_dir, char_code)
                        if os.path.exists(new_dir):
                            print(f"警告：目录 {char_code} 已存在，跳过 {item}")
                            continue
                        os.rename(item_path, new_dir)
                        item_path = new_dir
                        role_info_file = os.path.join(new_dir, 'role_info.json')
                    
                    role_info['role_code'] = char_code
                    with open(role_info_file, 'w', encoding='utf-8') as f:
                        json.dump(role_info, f, ensure_ascii=False, indent=2)
                    
                    print(f"修复角色: {role_name} -> {char_code}")
                
                if role_code:
                    performer_codes.append(role_code)

# 更新预设文件
preset['performer_codes'] = performer_codes
with open(preset_file, 'w', encoding='utf-8') as f:
    json.dump(preset, f, ensure_ascii=False, indent=2)

print(f"\n修复完成！角色代码: {performer_codes}")
print(f"预设文件已更新: {preset_file}")

