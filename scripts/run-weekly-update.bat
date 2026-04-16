@echo off
chcp 65001 >nul 2>&1
echo ========================================
echo Steam游戏数据 - 统一工作流
echo ========================================
echo 时间: %date% %time%
echo.

cd /d D:\Steam全域游戏搜索

echo [1/1] 运行统一工作流(增量采集+标签补全+SQLite同步+预计算)...
python scripts\unified_workflow.py

if errorlevel 1 (
    echo 统一工作流中断,检查点已保存
    exit /b 1
)

echo.
echo ========================================
echo 更新完成
echo ========================================
