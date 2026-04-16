"""设置定时任务 - 运行后立即配置"""
import subprocess
import sys
from datetime import datetime

def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}', flush=True)

task_name = "SteamGameWeeklyUpdate"
script_path = r'D:\Steam全域游戏搜索\scripts\run-weekly-update.bat'

log(f'配置定时任务: {task_name}')
log(f'执行脚本: {script_path}')

# 删除旧任务
log('删除旧任务...')
subprocess.run(['schtasks', '/Delete', '/TN', task_name, '/F'],
               capture_output=True, timeout=10)

# 创建新任务
log('创建新任务...')
cmd = [
    'schtasks',
    '/Create',
    '/TN', task_name,
    '/TR', f'"{script_path}"',
    '/SC', 'WEEKLY',
    '/D', 'SUN',
    '/ST', '02:00',
    '/F'
]

result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

if result.returncode == 0:
    log('任务创建成功!')
    log('')
    log('=' * 50)
    log('定时任务已配置')
    log('=' * 50)
    log(f'任务名称: {task_name}')
    log('执行时间: 每周日 02:00 (凌晨2点)')
    log('')
    log('工作流程:')
    log('  1. incremental_fetch.py - 发现并采集新游戏')
    log('  2. precompute.py - 更新预计算缓存')
    log('  3. backup-data.py - 备份数据')
    log('')
    log('手动运行: schtasks /Run /TN "SteamGameWeeklyUpdate"')
    log('查看任务: Win+R -> taskschd.msc')
    log('删除任务: schtasks /Delete /TN "SteamGameWeeklyUpdate" /F')
else:
    log(f'任务创建失败: {result.stderr}')
    sys.exit(1)
