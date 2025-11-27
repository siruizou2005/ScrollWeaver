"""
快速制作书卷功能 - 从用户描述生成完整的书卷配置

根据文档要求，使用 Gemini-3-Pro 从用户的一句话描述（如"赛博朋克版红楼梦"）
自动生成完整的 World + Roles 配置。
"""
import os
import json
import re
from typing import Dict, List, Optional, Any
from sw_utils import load_json_file, save_json_file, get_models


class FastScrollGenerator:
    """快速书卷生成器类"""
    
    def __init__(self, llm_name: str = "gemini-2.5-pro", llm=None):
        """
        初始化快速书卷生成器
        
        Args:
            llm_name: LLM 模型名称，默认使用 gemini-2.5-pro（文档要求 gemini-3-pro，但当前可能不可用）
            llm: 可选的 LLM 实例，如果提供则直接使用
        """
        self.llm_name = llm_name
        if llm is None:
            self.llm = get_models(llm_name)
        else:
            self.llm = llm
    
    def generate_scroll_config(self,
                              user_description: str,
                              language: str = "zh",
                              num_characters: int = 5,
                              num_locations: int = 5) -> Dict[str, Any]:
        """
        从用户描述生成完整的书卷配置
        
        Args:
            user_description: 用户的一句话描述（如"赛博朋克版红楼梦"）
            language: 语言，默认中文
            num_characters: 生成的角色数量
            num_locations: 生成的地点数量
            
        Returns:
            完整的书卷配置字典，包含：
            - world: 世界观配置
            - characters: 角色列表
            - locations: 地点列表
            - event_chain: 事件链（可选）
        """
        if language == "zh":
            prompt = self._build_chinese_prompt(user_description, num_characters, num_locations)
        else:
            prompt = self._build_english_prompt(user_description, num_characters, num_locations)
        
        try:
            print(f"[FastScrollGenerator] 开始生成书卷配置: {user_description}")
            response = self.llm.chat(prompt, temperature=0.8)
            
            # 解析响应
            if isinstance(response, str):
                # 尝试解析 JSON
                try:
                    # 移除可能的 markdown 代码块标记
                    response = response.strip()
                    if response.startswith("```json"):
                        response = response[7:]
                    if response.startswith("```"):
                        response = response[3:]
                    if response.endswith("```"):
                        response = response[:-3]
                    response = response.strip()
                    
                    config_data = json.loads(response)
                except json.JSONDecodeError as e:
                    print(f"[FastScrollGenerator] JSON 解析失败: {e}")
                    print(f"[FastScrollGenerator] 原始响应: {response[:500]}")
                    # 返回默认配置
                    return self._generate_default_config(user_description, language, num_characters, num_locations)
            else:
                config_data = response
            
            # 验证和规范化配置
            config = self._validate_and_normalize_config(config_data, user_description, language, num_characters, num_locations)
            
            print(f"[FastScrollGenerator] 书卷配置生成成功")
            return config
            
        except Exception as e:
            print(f"[FastScrollGenerator] 生成书卷配置失败: {e}")
            import traceback
            traceback.print_exc()
            # 返回默认配置
            return self._generate_default_config(user_description, language, num_characters, num_locations)
    
    def _build_chinese_prompt(self, user_description: str, num_characters: int, num_locations: int) -> str:
        """构建中文 prompt"""
        prompt = f"""请根据以下描述，生成一个完整的故事书卷配置。

## 用户描述
{user_description}

## 要求

请生成以下内容：

1. **世界观 (world)**: 
   - world_name: 世界观名称
   - description: 详细的世界观描述（200-300字）
   - language: 语言代码（"zh" 或 "en"）

2. **角色列表 (characters)**: 生成 {num_characters} 个主要角色
   每个角色包含：
   - role_name: 角色名称
   - nickname: 昵称（可与角色名相同）
   - profile: 角色简介（100-150字）
   - gender: 性别
   - identity: 身份列表（如 ["学生", "主角"]）
   - motivation: 角色的动机（50字以内）

3. **地点列表 (locations)**: 生成 {num_locations} 个地点
   每个地点包含：
   - location_name: 地点名称
   - description: 地点简介（50字以内）
   - detail: 地点详细描述（100-150字）

## 输出格式

请以 JSON 格式输出，格式如下：

{{
  "world": {{
    "world_name": "世界观名称",
    "description": "世界观详细描述",
    "language": "zh"
  }},
  "characters": [
    {{
      "role_name": "角色名",
      "nickname": "昵称",
      "profile": "角色简介",
      "gender": "男/女",
      "identity": ["身份1", "身份2"],
      "motivation": "角色动机"
    }},
    ...
  ],
  "locations": [
    {{
      "location_name": "地点名",
      "description": "地点简介",
      "detail": "地点详细描述"
    }},
    ...
  ]
}}

要求：
- 世界观描述应该丰富详细，体现设定的特色
- 角色应该有鲜明的个性和背景
- 地点应该与世界观相符
- 输出必须是有效的 JSON 格式，不要包含 Markdown 代码块标记
"""
        return prompt
    
    def _build_english_prompt(self, user_description: str, num_characters: int, num_locations: int) -> str:
        """构建英文 prompt"""
        prompt = f"""Please generate a complete story scroll configuration based on the following description.

## User Description
{user_description}

## Requirements

Please generate the following:

1. **World (world)**: 
   - world_name: World name
   - description: Detailed world description (200-300 words)
   - language: Language code ("zh" or "en")

2. **Character List (characters)**: Generate {num_characters} main characters
   Each character includes:
   - role_name: Character name
   - nickname: Nickname (can be same as role_name)
   - profile: Character profile (100-150 words)
   - gender: Gender
   - identity: List of identities (e.g., ["student", "protagonist"])
   - motivation: Character motivation (within 50 words)

3. **Location List (locations)**: Generate {num_locations} locations
   Each location includes:
   - location_name: Location name
   - description: Location brief description (within 50 words)
   - detail: Location detailed description (100-150 words)

## Output Format

Please output in JSON format as follows:

{{
  "world": {{
    "world_name": "World Name",
    "description": "Detailed world description",
    "language": "en"
  }},
  "characters": [
    {{
      "role_name": "Character Name",
      "nickname": "Nickname",
      "profile": "Character profile",
      "gender": "Male/Female",
      "identity": ["Identity1", "Identity2"],
      "motivation": "Character motivation"
    }},
    ...
  ],
  "locations": [
    {{
      "location_name": "Location Name",
      "description": "Location brief description",
      "detail": "Location detailed description"
    }},
    ...
  ]
}}

Requirements:
- World description should be rich and detailed, reflecting the setting's characteristics
- Characters should have distinct personalities and backgrounds
- Locations should match the world setting
- Output must be valid JSON format, do not include Markdown code block markers
"""
        return prompt
    
    def _validate_and_normalize_config(self,
                                       config_data: Dict[str, Any],
                                       user_description: str,
                                       language: str,
                                       num_characters: int,
                                       num_locations: int) -> Dict[str, Any]:
        """验证和规范化配置数据"""
        # 验证世界配置
        world = config_data.get("world", {})
        if not isinstance(world, dict):
            world = {}
        
        normalized_world = {
            "world_name": world.get("world_name", user_description),
            "description": world.get("description", f"基于'{user_description}'的世界观"),
            "language": world.get("language", language),
            "source": ""  # 将在保存时设置
        }
        
        # 验证角色列表
        characters = config_data.get("characters", [])
        if not isinstance(characters, list):
            characters = []
        
        normalized_characters = []
        for i, char in enumerate(characters[:num_characters]):
            if not isinstance(char, dict):
                continue
            normalized_char = {
                "role_name": char.get("role_name", f"角色{i+1}"),
                "nickname": char.get("nickname", char.get("role_name", f"角色{i+1}")),
                "profile": char.get("profile", ""),
                "gender": char.get("gender", "未知"),
                "identity": char.get("identity", []) if isinstance(char.get("identity"), list) else [],
                "motivation": char.get("motivation", "")
            }
            normalized_characters.append(normalized_char)
        
        # 如果角色数量不够，补充默认角色
        while len(normalized_characters) < num_characters:
            normalized_characters.append({
                "role_name": f"角色{len(normalized_characters)+1}",
                "nickname": f"角色{len(normalized_characters)+1}",
                "profile": f"基于'{user_description}'的角色",
                "gender": "未知",
                "identity": [],
                "motivation": ""
            })
        
        # 验证地点列表
        locations = config_data.get("locations", [])
        if not isinstance(locations, list):
            locations = []
        
        normalized_locations = []
        for i, loc in enumerate(locations[:num_locations]):
            if not isinstance(loc, dict):
                continue
            normalized_loc = {
                "location_name": loc.get("location_name", f"地点{i+1}"),
                "description": loc.get("description", ""),
                "detail": loc.get("detail", "")
            }
            normalized_locations.append(normalized_loc)
        
        # 如果地点数量不够，补充默认地点
        while len(normalized_locations) < num_locations:
            normalized_locations.append({
                "location_name": f"地点{len(normalized_locations)+1}",
                "description": f"基于'{user_description}'的地点",
                "detail": ""
            })
        
        return {
            "world": normalized_world,
            "characters": normalized_characters,
            "locations": normalized_locations
        }
    
    def _generate_default_config(self,
                                 user_description: str,
                                 language: str,
                                 num_characters: int,
                                 num_locations: int) -> Dict[str, Any]:
        """生成默认配置"""
        world = {
            "world_name": user_description,
            "description": f"基于'{user_description}'的世界观设定",
            "language": language,
            "source": ""
        }
        
        characters = []
        for i in range(num_characters):
            characters.append({
                "role_name": f"角色{i+1}",
                "nickname": f"角色{i+1}",
                "profile": f"基于'{user_description}'的角色",
                "gender": "未知",
                "identity": [],
                "motivation": ""
            })
        
        locations = []
        for i in range(num_locations):
            locations.append({
                "location_name": f"地点{i+1}",
                "description": f"基于'{user_description}'的地点",
                "detail": ""
            })
        
        return {
            "world": world,
            "characters": characters,
            "locations": locations
        }
    
    def save_scroll_config(self,
                          config: Dict[str, Any],
                          source_name: str,
                          base_dir: str = "./data") -> Dict[str, str]:
        """
        保存书卷配置到文件系统
        
        Args:
            config: 书卷配置
            source_name: 源名称（用于文件路径）
            base_dir: 基础目录
            
        Returns:
            包含保存路径的字典
        """
        paths = {}
        
        try:
            # 创建目录结构
            world_dir = f"{base_dir}/worlds/{source_name}"
            roles_dir = f"{base_dir}/roles/{source_name}"
            locations_file = f"{base_dir}/locations/{source_name}.json"
            
            os.makedirs(world_dir, exist_ok=True)
            os.makedirs(roles_dir, exist_ok=True)
            os.makedirs(os.path.dirname(locations_file), exist_ok=True)
            
            # 保存世界观
            world = config.get("world", {})
            world["source"] = source_name
            world_file = f"{world_dir}/general.json"
            save_json_file(world_file, world)
            paths["world_file"] = world_file
            
            # 保存角色
            characters = config.get("characters", [])
            for char in characters:
                role_code = self._name_to_code(char.get("role_name", ""))
                role_dir = f"{roles_dir}/{role_code}-{world.get('language', 'zh')}"
                os.makedirs(role_dir, exist_ok=True)
                
                role_info = {
                    "role_code": role_code,
                    "role_name": char.get("role_name", ""),
                    "nickname": char.get("nickname", char.get("role_name", "")),
                    "profile": char.get("profile", ""),
                    "gender": char.get("gender", "未知"),
                    "identity": char.get("identity", []),
                    "motivation": char.get("motivation", ""),
                    "activity": 1.0,
                    "relation": {},
                    "source": source_name
                }
                
                role_info_file = f"{role_dir}/role_info.json"
                save_json_file(role_info_file, role_info)
            
            paths["roles_dir"] = roles_dir
            
            # 保存地点
            locations = config.get("locations", [])
            locations_dict = {}
            for loc in locations:
                location_code = self._name_to_code(loc.get("location_name", ""))
                locations_dict[location_code] = {
                    "location_code": location_code,
                    "location_name": loc.get("location_name", ""),
                    "description": loc.get("description", ""),
                    "detail": loc.get("detail", ""),
                    "source": source_name
                }
            
            save_json_file(locations_file, locations_dict)
            paths["locations_file"] = locations_file
            
            print(f"[FastScrollGenerator] 书卷配置已保存到: {source_name}")
            return paths
            
        except Exception as e:
            print(f"[FastScrollGenerator] 保存书卷配置失败: {e}")
            import traceback
            traceback.print_exc()
            return paths
    
    def _name_to_code(self, name: str) -> str:
        """将名称转换为代码（用于文件名）"""
        # 移除特殊字符，转换为小写，用下划线连接
        code = re.sub(r'[^\w\s-]', '', name)
        code = re.sub(r'[-\s]+', '_', code).lower()
        return code


if __name__ == "__main__":
    # 示例用法
    generator = FastScrollGenerator(llm_name="gemini-2.5-pro")
    
    # 生成书卷配置示例
    # config = generator.generate_scroll_config(
    #     user_description="赛博朋克版红楼梦",
    #     language="zh",
    #     num_characters=5,
    #     num_locations=5
    # )
    # 
    # generator.save_scroll_config(config, "cyberpunk_dream", "./data")

