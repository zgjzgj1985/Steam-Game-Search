# -*- coding: utf-8 -*-
"""
日志工具 - 统一的日志输出函数
"""
import sys
from datetime import datetime

# 确保 stdout 使用 UTF-8 编码
sys.stdout.reconfigure(encoding='utf-8')


def log(msg: str, with_timestamp: bool = False) -> None:
    """
    统一的日志输出函数

    Args:
        msg: 日志消息
        with_timestamp: 是否添加时间戳前缀
    """
    if with_timestamp:
        print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}', flush=True)
    else:
        print(msg, flush=True)


def warn(msg: str) -> None:
    """输出警告信息"""
    print(f'[警告] {msg}', flush=True)


def error(msg: str) -> None:
    """输出错误信息"""
    print(f'[错误] {msg}', flush=True)


def success(msg: str) -> None:
    """输出成功信息"""
    print(f'[成功] {msg}', flush=True)


def info(msg: str) -> None:
    """输出信息"""
    print(f'[信息] {msg}', flush=True)
