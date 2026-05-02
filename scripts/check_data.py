# -*- coding: utf-8 -*-
import json

with open('public/data/games-cache.json', 'r', encoding='utf-8') as f:
    cache = json.load(f)
games = cache['games']

# Check genres
non_empty_genres = sum(1 for g in games if g.get('genres'))
non_empty_tags = sum(1 for g in games if g.get('tags') and len(g.get('tags', [])) > 0)
print(f'Cache - Games with genres: {non_empty_genres} / {len(games)}')
print(f'Cache - Games with tags (array): {non_empty_tags} / {len(games)}')

# Check raw data
with open('public/data/games-index.json', 'r', encoding='utf-8') as f:
    raw = json.load(f)
print(f'\nRaw - Total games: {len(raw)}')

# Check a few samples
for sid in list(raw.keys())[:5]:
    g = raw[sid]
    genres = g.get('genres', [])
    tags = g.get('tags', {})
    print(f'{sid}: name={g["name"]}, genres={genres}, tags_type={type(tags).__name__}, tags_count={len(tags) if isinstance(tags, dict) else len(tags)}')
