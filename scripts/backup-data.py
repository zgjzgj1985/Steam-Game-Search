"""
Steam Game Data Backup Script
"""
import shutil
from pathlib import Path
from datetime import datetime
import json
import sys

BACKUP_DIR = Path(r'D:\SteamDataBackup')
DATA_DIR = Path(r'D:\Steam全域游戏搜索\public\data')

def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")

def format_size(bytes_size):
    if bytes_size >= 1024**3:
        return f"{bytes_size / 1024**3:.2f} GB"
    elif bytes_size >= 1024**2:
        return f"{bytes_size / 1024**2:.2f} MB"
    elif bytes_size >= 1024:
        return f"{bytes_size / 1024:.2f} KB"
    return f"{bytes_size} B"

def backup():
    log("Starting backup...")

    if not DATA_DIR.exists():
        log(f"ERROR: Source directory not found: {DATA_DIR}")
        return False

    # Create backup directory
    date_str = datetime.now().strftime('%Y-%m-%d_%H%M%S')
    target_dir = BACKUP_DIR / f"backup_{date_str}"
    target_dir.mkdir(parents=True, exist_ok=True)

    # Backup files
    total_size = 0
    file_count = 0

    for pattern in ['*.json', '*.db']:
        for file in DATA_DIR.glob(pattern):
            if file.name == 'backup_info.json':
                continue
            target_file = target_dir / file.name
            log(f"Copying: {file.name} ({format_size(file.stat().st_size)})")
            shutil.copy2(file, target_file)
            total_size += file.stat().st_size
            file_count += 1

    # Write backup info
    backup_info = {
        'backupDate': date_str,
        'sourceDir': str(DATA_DIR),
        'filesCount': file_count,
        'totalSize': total_size
    }
    with open(target_dir / 'backup_info.json', 'w', encoding='utf-8') as f:
        json.dump(backup_info, f, ensure_ascii=False, indent=2)

    log(f"Backup completed! {file_count} files, total {format_size(total_size)}")
    log(f"Location: {target_dir}")

    # Cleanup old backups
    cleanup_old_backups()

    return True

def cleanup_old_backups():
    log("Checking old backups...")

    if not BACKUP_DIR.exists():
        return

    cutoff_days = 28
    cutoff_time = datetime.now().timestamp() - (cutoff_days * 24 * 3600)

    for backup_folder in BACKUP_DIR.iterdir():
        if backup_folder.is_dir() and backup_folder.name.startswith('backup_'):
            if backup_folder.stat().st_mtime < cutoff_time:
                log(f"Removing old backup: {backup_folder.name}")
                shutil.rmtree(backup_folder)

    log("Cleanup completed")

def show_status():
    log("=== Backup Status ===")

    if not BACKUP_DIR.exists():
        log("No backups found")
        return

    backups = sorted([d for d in BACKUP_DIR.iterdir() if d.is_dir() and d.name.startswith('backup_')],
                     key=lambda x: x.stat().st_mtime, reverse=True)

    log(f"Total backups: {len(backups)}")
    for backup in backups[:10]:
        total = sum(f.stat().st_size for f in backup.glob('*') if f.is_file())
        age_days = (datetime.now() - datetime.fromtimestamp(backup.stat().st_mtime)).days
        log(f"  {backup.name} - {format_size(total)} - {age_days} days ago")

def restore(backup_name):
    source_dir = BACKUP_DIR / backup_name

    if not source_dir.exists():
        log(f"ERROR: Backup not found: {backup_name}")
        show_status()
        return False

    confirm = input("WARNING: This will overwrite existing data! Confirm? (y/N): ")
    if confirm.lower() != 'y':
        log("Cancelled")
        return False

    log(f"Restoring: {backup_name}")

    for file in source_dir.glob('*'):
        if file.name == 'backup_info.json':
            continue
        target_file = DATA_DIR / file.name
        log(f"Restoring: {file.name}")
        shutil.copy2(file, target_file)

    log("Restore completed!")
    return True

def main():
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == 'status':
            show_status()
        elif cmd == 'restore':
            if len(sys.argv) > 2:
                restore(sys.argv[2])
            else:
                show_status()
        elif cmd == 'cleanup':
            cleanup_old_backups()
        elif cmd == 'help':
            print("Usage:")
            print("  backup-data.py           Backup data")
            print("  backup-data.py status    Show backup status")
            print("  backup-data.py restore   Restore backup")
            print("  backup-data.py cleanup   Cleanup old backups")
        else:
            print(f"Unknown command: {cmd}")
    else:
        backup()

if __name__ == '__main__':
    print("")
    print("=" * 40)
    print("   Steam Game Data Backup Tool")
    print("=" * 40)
    print("")
    main()
    print("")
