#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
直接测试 Gemini 图片生成 API
"""
import os
from pathlib import Path
from PIL import Image
import io

try:
    from google import genai
    USE_NEW_GENAI_API = True
    print("使用新的 google.genai API")
except ImportError:
    import google.generativeai as genai
    USE_NEW_GENAI_API = False
    print("使用旧的 google.generativeai API")

# 加载 API Key
config_path = Path(__file__).parent / "config.json"
import json
with open(config_path) as f:
    config = json.load(f)
    api_key = config.get("GEMINI_API_KEY")

if not api_key:
    print("错误：未找到 GEMINI_API_KEY")
    exit(1)

# 初始化客户端
if USE_NEW_GENAI_API:
    client = genai.Client(api_key=api_key)
else:
    genai.configure(api_key=api_key)

# 读取测试图片
pic_dir = Path(__file__).parent / "pic"
test_image_path = pic_dir / "正面照.jpg"

if not test_image_path.exists():
    print(f"错误：找不到测试图片 {test_image_path}")
    exit(1)

img = Image.open(test_image_path)
print(f"✓ 加载图片: {test_image_path}")
print(f"  尺寸: {img.size}")

# 提示词
prompt = "请动漫化人物图片"
print(f"\n提示词: {prompt}")

# 调用 API
print(f"\n调用模型: gemini-2.5-flash-image")
try:
    if USE_NEW_GENAI_API:
        response = client.models.generate_content(
            model='gemini-2.5-flash-image',
            contents=[prompt, img],
        )
        print(f"\n响应类型: {type(response)}")
        print(f"响应属性: {dir(response)}")
        
        if hasattr(response, 'parts'):
            print(f"\n响应 parts 数量: {len(response.parts)}")
            for i, part in enumerate(response.parts):
                print(f"\n--- Part {i} ---")
                print(f"类型: {type(part)}")
                print(f"属性: {dir(part)}")
                
                if hasattr(part, 'inline_data'):
                    print(f"inline_data: {part.inline_data}")
                    if part.inline_data is not None:
                        print("✓ 找到图片数据！")
                        try:
                            generated_image = part.as_image()
                            print(f"生成的图片尺寸: {generated_image.size}")
                            output_path = pic_dir / "test_output.png"
                            generated_image.save(output_path)
                            print(f"✓ 保存到: {output_path}")
                        except Exception as e:
                            print(f"❌ 提取图片失败: {e}")
                            import traceback
                            traceback.print_exc()
                
                if hasattr(part, 'text'):
                    text = part.text
                    print(f"文本内容: {text[:500] if text else 'None'}")
        else:
            print("响应没有 parts 属性")
            if hasattr(response, 'text'):
                print(f"响应文本: {response.text[:500]}")
    else:
        model = genai.GenerativeModel('gemini-2.5-flash-image')
        response = model.generate_content([prompt, img])
        
        print(f"\n响应类型: {type(response)}")
        print(f"响应属性: {dir(response)}")
        
        if hasattr(response, 'candidates') and response.candidates:
            candidate = response.candidates[0]
            print(f"\n候选数量: {len(response.candidates)}")
            print(f"候选属性: {dir(candidate)}")
            
            if hasattr(candidate, 'content'):
                content = candidate.content
                print(f"内容属性: {dir(content)}")
                
                if hasattr(content, 'parts'):
                    print(f"Parts 数量: {len(content.parts)}")
                    for i, part in enumerate(content.parts):
                        print(f"\n--- Part {i} ---")
                        print(f"类型: {type(part)}")
                        print(f"属性: {dir(part)}")
                        
                        if hasattr(part, 'inline_data') and part.inline_data:
                            print("✓ 找到图片数据！")
                            import base64
                            try:
                                image_data = base64.b64decode(part.inline_data.data)
                                output_path = pic_dir / "test_output_old.png"
                                with open(output_path, 'wb') as f:
                                    f.write(image_data)
                                print(f"✓ 保存到: {output_path}")
                            except Exception as e:
                                print(f"❌ 解码失败: {e}")
                        
                        if hasattr(part, 'text'):
                            print(f"文本: {part.text[:200] if part.text else 'None'}")

except Exception as e:
    print(f"\n❌ API 调用失败: {e}")
    import traceback
    traceback.print_exc()

