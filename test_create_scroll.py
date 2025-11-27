#!/usr/bin/env python3
"""测试创建书卷功能"""
import requests
import json

API_BASE = "http://localhost:8000"

# 测试数据
test_data = {
    "title": "测试书卷",
    "description": "这是一个测试书卷",
    "worldName": "测试书卷",
    "worldDescription": "这是一个测试世界观，用于验证创建书卷功能是否正常工作。",
    "language": "zh",
    "locations": [
        {
            "name": "测试地点1",
            "description": "这是第一个测试地点",
            "detail": "详细的测试地点信息"
        }
    ],
    "characters": [
        {
            "name": "测试角色1",
            "code": "test_character_1",
            "nickname": "角色1",
            "profile": "这是一个测试角色"
        }
    ]
}

def test_create_scroll():
    """测试创建书卷API"""
    print("=" * 50)
    print("测试创建书卷功能")
    print("=" * 50)
    
    # 首先需要登录获取token（这里假设有一个测试用户）
    # 注意：实际测试时需要先登录获取token
    print("\n注意：此测试需要有效的认证token")
    print("请先登录获取token，然后修改此脚本")
    
    # 模拟请求
    url = f"{API_BASE}/api/create-scroll"
    headers = {
        "Content-Type": "application/json",
        # "Authorization": "Bearer YOUR_TOKEN_HERE"  # 需要替换为实际token
    }
    
    print(f"\n请求URL: {url}")
    print(f"请求数据: {json.dumps(test_data, ensure_ascii=False, indent=2)}")
    
    try:
        # 注意：这里会失败，因为没有token，但可以看到请求格式是否正确
        response = requests.post(url, json=test_data, headers=headers, timeout=10)
        print(f"\n响应状态码: {response.status_code}")
        print(f"响应内容: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ 创建成功!")
            print(f"书卷ID: {data.get('scroll_id')}")
        elif response.status_code == 401:
            print("\n⚠️  需要认证token")
        else:
            print(f"\n❌ 创建失败: {response.text}")
    except requests.exceptions.ConnectionError:
        print("\n❌ 无法连接到服务器，请确保服务器正在运行")
    except Exception as e:
        print(f"\n❌ 发生错误: {e}")

if __name__ == "__main__":
    test_create_scroll()

