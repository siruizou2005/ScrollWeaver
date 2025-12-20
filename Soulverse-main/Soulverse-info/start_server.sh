#!/bin/bash
# 启动数字孪生生成器的HTTP服务器

cd "$(dirname "$0")"

echo "============================================================"
echo "正在启动数字孪生生成器服务器..."
echo "============================================================"

# 检查Python是否安装
if command -v python3 &> /dev/null; then
    python3 start_server.py
elif command -v python &> /dev/null; then
    python start_server.py
else
    echo "错误: 未找到Python，请先安装Python 3"
    exit 1
fi

