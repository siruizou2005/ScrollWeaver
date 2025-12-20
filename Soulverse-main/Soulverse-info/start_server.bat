@echo off
REM Windows批处理脚本，用于启动数字孪生生成器服务器

cd /d "%~dp0"

echo ============================================================
echo 正在启动数字孪生生成器服务器...
echo ============================================================

REM 检查Python是否安装
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到Python，请先安装Python 3
    pause
    exit /b 1
)

python start_server.py

pause

