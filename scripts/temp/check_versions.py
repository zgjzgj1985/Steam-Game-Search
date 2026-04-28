# -*- coding: utf-8 -*-
import re, sys
sys.stdout.reconfigure(encoding='utf-8')

files = [
    r'D:\Steam全域游戏搜索\docs\PROJECT.md',
    r'D:\Steam全域游戏搜索\docs\模式2.md',
    r'D:\Steam全域游戏搜索\docs\池子创新标签质量审核报告.md'
]
for f in files:
    c = open(f, 'r', encoding='utf-8').read()
    m = re.search(r'v(\d+\.\d+\.\d+)', c)
    date_m = re.search(r'\d{4}-\d{2}-\d{2}', c)
    fname = f.split('\\')[-1]
    print('%s: v%s (%s)' % (fname, m.group(1) if m else '?', date_m.group() if date_m else '?'))
