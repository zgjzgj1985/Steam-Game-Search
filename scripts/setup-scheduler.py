"""
配置Windows定时任务 - 每周自动更新Steam游戏数据

使用方法:
    python scripts/setup-scheduler.py

会创建一个名为 "SteamGameWeeklyUpdate" 的计划任务
每周日凌晨2点执行 run-weekly-update.bat
"""
import os
import sys
import subprocess
from datetime import datetime

def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}', flush=True)

def create_scheduled_task():
    """创建Windows计划任务"""
    log('创建定时任务...')

    task_name = "SteamGameWeeklyUpdate"

    try:
        subprocess.run(
            ['schtasks', '/Delete', '/TN', task_name, '/F'],
            capture_output=True,
            timeout=10
        )
        log(f'  已删除旧任务: {task_name}')
    except:
        pass

    script_path = r'D:\Steam全域游戏搜索\scripts\run-weekly-update.bat'

    cmd = [
        'schtasks',
        '/Create',
        '/TN', task_name,
        '/TR', f'"{script_path}"',
        '/SC', 'WEEKLY',
        '/D', 'SUN',
        '/ST', '02:00',
        '/RU', 'SYSTEM',
        '/RL', 'HIGHEST',
        '/F'
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

    if result.returncode == 0:
        log(f'  任务创建成功: {task_name}')
        log('  执行时间: 每周日 02:00')
        log(f'  执行脚本: {script_path}')
        return True
    else:
        log(f'  任务创建失败: {result.stderr}')
        return False

def show_task_info():
    """显示任务信息"""
    log('')
    log('=' * 50)
    log('定时任务信息')
    log('=' * 50)
    log('任务名称: SteamGameWeeklyUpdate')
    log('执行时间: 每周日 02:00 (凌晨2点)')
    log('执行脚本: D:\\Steam全域游戏搜索\\scripts\\run-weekly-update.bat')
    log('')
    log('工作流程:')
    log('  1. unified_workflow.py - 统一工作流(增量采集+标签补全+SQLite同步+预计算)')
    log('')
    log('查看任务: 任务计划程序 -> SteamGameWeeklyUpdate')
    log('手动运行: schtasks /Run /TN "SteamGameWeeklyUpdate"')
    log('删除任务: schtasks /Delete /TN "SteamGameWeeklyUpdate" /F')
    log('=' * 50)

def main():
    log('=' * 50)
    log('Steam游戏数据 - 定时任务配置')
    log('=' * 50)

    if os.name != 'nt':
        log('错误: 此脚本仅适用于Windows')
        return

    print()
    response = input('将创建定时任务: SteamGameWeeklyUpdate\n'
                    '  每周日 02:00 执行统一工作流\n'
                    '  按回车确认，或输入 N 取消: ')

    if response.strip().upper() == 'N':
        log('取消')
        return

    if create_scheduled_task():
        show_task_info()

if __name__ == '__main__':
    main()
