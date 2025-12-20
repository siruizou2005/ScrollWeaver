#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试动漫化 API
"""
import requests
import os
from pathlib import Path

# API 端点
API_URL = "http://localhost:8001/api/generate-anime-images"

# 图片文件路径
pic_dir = Path(__file__).parent / "pic"
front_photo = pic_dir / "正面照.jpg"
life_photo_1 = pic_dir / "生活照.jpg"
life_photo_2 = pic_dir / "生活照-2.jpg"

def test_anime_api():
    """测试动漫化 API"""
    print("=" * 50)
    print("测试动漫化 API")
    print("=" * 50)
    
    # 检查文件是否存在
    if not front_photo.exists():
        print(f"❌ 错误：找不到文件 {front_photo}")
        return
    
    if not life_photo_1.exists():
        print(f"❌ 错误：找不到文件 {life_photo_1}")
        return
    
    if not life_photo_2.exists():
        print(f"❌ 错误：找不到文件 {life_photo_2}")
        return
    
    print(f"✓ 找到正面照: {front_photo}")
    print(f"✓ 找到生活照1: {life_photo_1}")
    print(f"✓ 找到生活照2: {life_photo_2}")
    print()
    
    # 准备文件
    files = {
        'front_photo': ('正面照.jpg', open(front_photo, 'rb'), 'image/jpeg'),
        'life_photo_1': ('生活照.jpg', open(life_photo_1, 'rb'), 'image/jpeg'),
        'life_photo_2': ('生活照-2.jpg', open(life_photo_2, 'rb'), 'image/jpeg'),
    }
    
    try:
        print("正在调用 API...")
        response = requests.post(API_URL, files=files, timeout=300)
        
        # 关闭文件
        for file_tuple in files.values():
            file_tuple[1].close()
        
        print(f"响应状态码: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("\n✅ 动漫化成功！")
            print(f"结果: {result}")
            
            if 'anime_images' in result:
                print("\n生成的动漫图片路径:")
                for img_type, img_path in result['anime_images'].items():
                    print(f"  {img_type}: {img_path}")
                    # 构建完整路径
                    full_path = Path(__file__).parent / img_path.lstrip('/api/anime-images/')
                    if full_path.exists():
                        print(f"    → 文件已保存到: {full_path}")
        else:
            print(f"\n❌ API 调用失败")
            print(f"错误信息: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ 错误：无法连接到服务器")
        print("请确保服务器正在运行: python server.py")
    except requests.exceptions.Timeout:
        print("❌ 错误：请求超时（API 调用可能需要较长时间）")
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_anime_api()

