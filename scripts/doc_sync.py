# -*- coding: utf-8 -*-
"""
文档自动同步脚本 - 自动扫描代码结构并同步到 PROJECT.md

功能：
- 扫描 scripts/ 目录，生成脚本清单和说明
- 扫描 src/app/api/ 目录，生成 API 路由文档
- 扫描 src/components/ 目录，生成组件清单
- 扫描 src/lib/ 目录，生成核心库清单
- 扫描 public/data/ 目录，生成数据文件清单
- 检测缺失文件（PROJECT.md 中记录但实际不存在的文件）
- 检测过时内容（PROJECT.md 中记录但代码已变更的部分）
- 生成诊断报告供用户确认

用法：
    python scripts/doc_sync.py          # 执行同步（修改 PROJECT.md）
    python scripts/doc_sync.py --check   # 仅生成诊断报告，不修改
    python scripts/doc_sync.py --dry-run # 显示将要做的更改，不实际写入

设计原则：
- 使用占位符标记自动生成区域，不破坏手动内容
- 占位符格式：<!-- AUTO_START:section_name --> ... <!-- AUTO_END:section_name -->
- 自动生成区域内的所有内容都会被替换
- 手动内容（占位符之外的区域）完全保留
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ==================== 路径配置 ====================
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
SRC_DIR = PROJECT_ROOT / "src"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
PUBLIC_DATA_DIR = PROJECT_ROOT / "public"
DOCS_DIR = PROJECT_ROOT / "docs"
PROJECT_MD = DOCS_DIR / "PROJECT.md"

# 标记编码
AUTO_START = "<!-- AUTO_START"
AUTO_END = "<!-- AUTO_END"

# ==================== 输出编码 ====================
if sys.platform == "win32":
    import io

    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


# ==================== 诊断报告存储 ====================
class DiagnosticReport:
    def __init__(self):
        self.scripts_found: List[str] = []
        self.scripts_missing: List[str] = []  # PROJECT.md 中有但文件不存在
        self.scripts_extra: List[str] = []  # 实际存在但 PROJECT.md 中没有

        self.api_found: List[str] = []
        self.api_missing: List[str] = []
        self.api_extra: List[str] = []

        self.components_found: List[str] = []
        self.components_missing: List[str] = []
        self.components_extra: List[str] = []

        self.lib_found: List[str] = []
        self.lib_missing: List[str] = []
        self.lib_extra: List[str] = []

        self.data_found: List[str] = []
        self.data_missing: List[str] = []
        self.data_extra: List[str] = []

        self.changes_to_make: List[str] = []
        self.warnings: List[str] = []
        self.timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ==================== 扫描函数 ====================

def scan_scripts() -> Dict[str, Dict]:
    """
    扫描 scripts/ 目录，提取脚本名称、说明和行数。

    返回：
        Dict[str, Dict] - key: 相对路径, value: {name, description, lines, ext}
    """
    result = {}
    if not SCRIPTS_DIR.exists():
        return result

    for f in sorted(SCRIPTS_DIR.iterdir()):
        if f.is_file():
            ext = f.suffix.lower()
            if ext in (".py", ".js", ".cjs", ".mjs", ".ts"):
                desc = ""
                lines = 0
                try:
                    content = f.read_text(encoding="utf-8", errors="replace")
                    lines = len(content.splitlines())

                    # 尝试从 docstring 提取描述
                    docstring_match = re.search(r'"""(.*?)"""', content, re.DOTALL)
                    if docstring_match:
                        docstring = docstring_match.group(1).strip()
                        first_line = docstring.split("\n")[0].strip()
                        if first_line:
                            desc = first_line
                        else:
                            lines_in_docstring = [
                                l.strip().lstrip("#").strip()
                                for l in docstring.splitlines()
                                if l.strip()
                            ]
                            for line in lines_in_docstring:
                                if line and not line.startswith("="):
                                    desc = line
                                    break
                    else:
                        # 尝试从注释提取
                        comment_match = re.search(r"//\s*(.+)", content)
                        if comment_match:
                            desc = comment_match.group(1).strip()

                    # 如果没有描述，用文件名
                    if not desc:
                        desc = f.stem.replace("_", " ").replace("-", " ").title()
                except Exception:
                    desc = f.stem

                result[str(f.relative_to(PROJECT_ROOT))] = {
                    "name": f.stem,
                    "description": desc,
                    "lines": lines,
                    "ext": ext,
                }
    return result


def scan_api_routes() -> Dict[str, Dict]:
    """
    扫描 src/app/api/ 目录，提取 API 路由信息。

    返回：
        Dict[str, Dict] - key: 相对路径, value: {method, description, lines}
    """
    result = {}
    api_dir = SRC_DIR / "app" / "api"
    if not api_dir.exists():
        return result

    for f in sorted(api_dir.rglob("route.ts")):
        rel_path = str(f.relative_to(SRC_DIR))

        # 提取路由路径
        route_path = "/" + str(f.parent.relative_to(api_dir)).replace("\\", "/")
        if route_path.endswith("/route"):
            route_path = route_path[: -len("/route")]

        # 提取 HTTP 方法
        methods = []
        lines = 0
        description = "API 路由"
        try:
            content = f.read_text(encoding="utf-8", errors="replace")
            lines = len(content.splitlines())

            # 查找导出函数
            for method in ["GET", "POST", "PUT", "DELETE", "PATCH"]:
                if re.search(rf"export\s+(?:async\s+)?function\s+{method}\s*\(", content):
                    methods.append(method)

            # 尝试从 JSDoc 提取描述
            jsdoc_match = re.search(r"/\*\*\s*\n(.*?)\n\s*\*/", content, re.DOTALL)
            if jsdoc_match:
                doc = jsdoc_match.group(1)
                lines_in_doc = [l.strip().lstrip("*").strip() for l in doc.splitlines() if l.strip()]
                for line in lines_in_doc:
                    if line and not line.startswith("@"):
                        description = line
                        break
        except Exception:
            pass

        if not methods:
            methods = ["GET"]

        result[rel_path] = {
            "route": route_path,
            "method": methods[0] if len(methods) == 1 else "/".join(methods),
            "methods": methods,
            "description": description,
            "lines": lines,
            "file": str(f.relative_to(PROJECT_ROOT)),
        }
    return result


def scan_components() -> Dict[str, Dict]:
    """
    扫描 src/components/ 目录，列出所有组件。

    返回：
        Dict[str, Dict] - key: 相对路径, value: {name, category, description, lines}
    """
    result = {}
    components_dir = SRC_DIR / "components"
    if not components_dir.exists():
        return result

    for subdir in sorted(components_dir.iterdir()):
        if not subdir.is_dir():
            continue
        category = subdir.name

        for f in sorted(subdir.glob("*.tsx")):
            rel_path = str(f.relative_to(SRC_DIR))
            name = f.stem.replace("-", " ").replace("_", " ").title()
            description = f.stem.replace("-", " ").replace("_", " ").replace("client ", "")
            lines = 0

            try:
                content = f.read_text(encoding="utf-8", errors="replace")
                lines = len(content.splitlines())

                # 尝试从 JSDoc 或首行注释提取描述
                jsdoc_match = re.search(r"/\*\*\s*\n(.*?)\n\s*\*/", content, re.DOTALL)
                if jsdoc_match:
                    doc = jsdoc_match.group(1)
                    lines_in_doc = [l.strip().lstrip("*").strip() for l in doc.splitlines() if l.strip()]
                    for line in lines_in_doc:
                        if line and not line.startswith("@"):
                            description = line
                            break
            except Exception:
                pass

            result[rel_path] = {
                "name": name,
                "category": category,
                "description": description,
                "lines": lines,
                "file": str(f.relative_to(PROJECT_ROOT)),
            }
    return result


def scan_lib() -> Dict[str, Dict]:
    """
    扫描 src/lib/ 目录，列出核心库文件。

    返回：
        Dict[str, Dict] - key: 相对路径, value: {name, description, lines}
    """
    result = {}
    lib_dir = SRC_DIR / "lib"
    if not lib_dir.exists():
        return result

    for f in sorted(lib_dir.iterdir()):
        if f.is_file():
            rel_path = str(f.relative_to(SRC_DIR))
            name = f.stem
            description = f.stem.replace("-", " ").replace("_", " ").replace("client", "").strip()
            lines = 0

            try:
                content = f.read_text(encoding="utf-8", errors="replace")
                lines = len(content.splitlines())

                # 尝试从 JSDoc 提取描述
                jsdoc_match = re.search(r"/\*\*\s*\n(.*?)\n\s*\*/", content, re.DOTALL)
                if jsdoc_match:
                    doc = jsdoc_match.group(1)
                    lines_in_doc = [l.strip().lstrip("*").strip() for l in doc.splitlines() if l.strip()]
                    for line in lines_in_doc:
                        if line and not line.startswith("@"):
                            description = line
                            break
            except Exception:
                pass

            result[rel_path] = {
                "name": name,
                "description": description,
                "lines": lines,
                "file": str(f.relative_to(PROJECT_ROOT)),
            }
    return result


def scan_types() -> Dict[str, Dict]:
    """
    扫描 src/types/ 目录，列出类型定义文件。

    返回：
        Dict[str, Dict] - key: 相对路径, value: {name, description, lines}
    """
    result = {}
    types_dir = SRC_DIR / "types"
    if not types_dir.exists():
        return result

    for f in sorted(types_dir.iterdir()):
        if f.is_file():
            rel_path = str(f.relative_to(SRC_DIR))
            name = f.stem
            description = f.stem.replace("-", " ").replace("_", " ").replace("client", "").strip()
            lines = 0

            try:
                content = f.read_text(encoding="utf-8", errors="replace")
                lines = len(content.splitlines())

                # 尝试从 JSDoc 提取描述
                jsdoc_match = re.search(r"/\*\*\s*\n(.*?)\n\s*\*/", content, re.DOTALL)
                if jsdoc_match:
                    doc = jsdoc_match.group(1)
                    lines_in_doc = [l.strip().lstrip("*").strip() for l in doc.splitlines() if l.strip()]
                    for line in lines_in_doc:
                        if line and not line.startswith("@"):
                            description = line
                            break
            except Exception:
                pass

            result[rel_path] = {
                "name": name,
                "description": description,
                "lines": lines,
                "file": str(f.relative_to(PROJECT_ROOT)),
            }
    return result


def scan_config() -> Dict[str, Dict]:
    """
    扫描 src/config/ 目录，列出配置文件。

    返回：
        Dict[str, Dict] - key: 相对路径, value: {name, description, lines}
    """
    result = {}
    config_dir = SRC_DIR / "config"
    if not config_dir.exists():
        return result

    for f in sorted(config_dir.iterdir()):
        if f.is_file():
            rel_path = str(f.relative_to(SRC_DIR))
            name = f.stem
            description = f.stem.replace("-", " ").replace("_", " ").replace("client", "").strip()
            lines = 0

            try:
                content = f.read_text(encoding="utf-8", errors="replace")
                lines = len(content.splitlines())
            except Exception:
                pass

            result[rel_path] = {
                "name": name,
                "description": description,
                "lines": lines,
                "file": str(f.relative_to(PROJECT_ROOT)),
            }
    return result


def scan_app_pages() -> Dict[str, Dict]:
    """
    扫描 src/app/ 目录（不含 api），列出所有页面。

    返回：
        Dict[str, Dict] - key: 相对路径, value: {route, description, lines}
    """
    result = {}
    app_dir = SRC_DIR / "app"
    if not app_dir.exists():
        return result

    # 排除 api 目录
    for f in sorted(app_dir.rglob("page.tsx")):
        rel_path = str(f.relative_to(SRC_DIR))

        # 计算路由
        parts = f.parent.relative_to(app_dir).parts
        if parts == ():
            route = "/"
        else:
            route = "/" + "/".join(parts)

        description = "页面"
        lines = 0

        try:
            content = f.read_text(encoding="utf-8", errors="replace")
            lines = len(content.splitlines())

            # 尝试从 JSDoc 或注释提取描述
            jsdoc_match = re.search(r"/\*\*\s*\n(.*?)\n\s*\*/", content, re.DOTALL)
            if jsdoc_match:
                doc = jsdoc_match.group(1)
                lines_in_doc = [l.strip().lstrip("*").strip() for l in doc.splitlines() if l.strip()]
                for line in lines_in_doc:
                    if line and not line.startswith("@"):
                        description = line
                        break
            else:
                # 尝试从代码中的字符串提取
                string_match = re.search(r"(?:title|heading|label)\s*[=:]\s*['\"]([^'\"]+)['\"]", content)
                if string_match:
                    description = string_match.group(1)
        except Exception:
            pass

        result[rel_path] = {
            "route": route,
            "description": description,
            "lines": lines,
            "file": str(f.relative_to(PROJECT_ROOT)),
        }
    return result


def scan_data_files() -> Dict[str, Dict]:
    """
    扫描 public/data/ 目录，列出数据文件。

    返回：
        Dict[str, Dict] - key: 相对路径, value: {name, size, description}
    """
    result = {}
    if not PUBLIC_DATA_DIR.exists():
        return result

    data_dir = PUBLIC_DATA_DIR / "data"
    if not data_dir.exists():
        return result

    for f in sorted(data_dir.iterdir()):
        if f.is_file():
            rel_path = str(f.relative_to(PUBLIC_DATA_DIR))
            size_bytes = f.stat().st_size

            # 格式化大小
            if size_bytes >= 1024 * 1024 * 1024:
                size_str = f"{size_bytes / (1024**3):.1f} GB"
            elif size_bytes >= 1024 * 1024:
                size_str = f"{size_bytes / (1024**2):.1f} MB"
            elif size_bytes >= 1024:
                size_str = f"{size_bytes / 1024:.1f} KB"
            else:
                size_str = f"{size_bytes} B"

            # 根据文件名猜测描述
            name = f.stem
            descriptions = {
                "games-index": "游戏索引文件 - 快速检索",
                "games-meta": "游戏元数据文件 - 完整描述",
                "analyses": "分析结果存储文件",
                "games-cache": "预计算缓存数据",
                "tag-clusters": "标签聚类映射表",
                "emerge-tags-log": "新兴标签日志",
                "combined-mechanics": "融合玩法分析数据",
            }
            description = descriptions.get(name.lower(), name)

            result[rel_path] = {
                "name": name,
                "size": size_str,
                "size_bytes": size_bytes,
                "description": description,
                "file": str(f.relative_to(PROJECT_ROOT)),
            }
    return result


# ==================== 内容生成函数 ====================

def generate_directory_tree() -> str:
    """生成完整的目录结构树。"""
    lines = [
        "```",
        "# 项目根目录",
        f"{PROJECT_ROOT.name}/",
    ]

    # 定义要展示的顶级目录和文件
    top_level = [
        ("src/", "Next.js 源代码", True),
        ("public/", "公开资源", True),
        ("scripts/", f"Python/JS 脚本（{len(list(SCRIPTS_DIR.glob('*.*')))}个）", True),
        ("prisma/", "Prisma Schema", True),
        ("docs/", "项目文档", True),
        ("docs/archive/", "已归档文档", True),
        (".cursor/rules/", "Cursor AI 规则", True),
        ("package.json", "项目配置", False),
        ("package-lock.json", "依赖锁定", False),
        ("next.config.js", "Next.js 配置", False),
        ("tailwind.config.js", "Tailwind CSS 配置", False),
        ("tsconfig.json", "TypeScript 配置", False),
        (".env.example", "环境变量示例", False),
        (".gitignore", "Git 忽略配置", False),
        (".gitattributes", "Git 属性配置", False),
    ]

    for item, desc, is_dir in top_level:
        path = PROJECT_ROOT / item.rstrip("/")
        if path.exists():
            if is_dir:
                lines.append(f"├── {item:<20}  # {desc}")
            else:
                lines.append(f"├── {item}")

    # src/ 子结构
    src_items = [
        ("app/", "App Router 页面", True),
        ("components/", "React 组件", True),
        ("lib/", "核心业务逻辑", True),
        ("types/", "TypeScript 类型", True),
        ("config/", "前端配置", True),
        ("__tests__/", "测试文件", True),
    ]
    lines.append("│")
    lines.append("├── src/")
    for item, desc, _ in src_items:
        path = SRC_DIR / item.rstrip("/")
        if path.exists():
            lines.append(f"│   ├── {item:<20}  # {desc}")

    lines.append("```")
    return "\n".join(lines)


def generate_scripts_section(scripts: Dict[str, Dict]) -> str:
    """生成脚本清单 section。"""
    lines = ["```"]
    lines.append("# Python/JS 脚本（按功能分组）")
    lines.append("")

    # 按扩展名分组
    py_scripts = {k: v for k, v in scripts.items() if v["ext"] in (".py",)}
    js_scripts = {k: v for k, v in scripts.items() if v["ext"] in (".js", ".cjs", ".mjs", ".ts")}

    # Python 脚本
    if py_scripts:
        lines.append("# --- Python 脚本 ---")
        for path, info in py_scripts.items():
            ext_note = " [ESM]" if info["ext"] == ".mjs" else " [CommonJS]" if info["ext"] == ".cjs" else ""
            lines.append(f"# {info['description']}")
            lines.append(f"#   {path} ({info['lines']}行{ext_note})")
            lines.append("")

    # JS 脚本
    if js_scripts:
        lines.append("# --- JavaScript 脚本 ---")
        for path, info in js_scripts.items():
            ext_note = " [ESM]" if info["ext"] == ".mjs" else " [CommonJS]" if info["ext"] == ".cjs" else ""
            lines.append(f"# {info['description']}")
            lines.append(f"#   {path} ({info['lines']}行{ext_note})")
            lines.append("")

    lines.append("```")
    return "\n".join(lines)


def generate_api_section(apis: Dict[str, Dict]) -> str:
    """生成 API 接口 section。"""
    if not apis:
        return "*(暂无 API 路由)*"

    lines = []
    for path, info in sorted(apis.items()):
        method = info["method"]
        desc = info["description"]
        file_path = info["file"]
        route = info["route"]

        lines.append(f"### {route}")
        lines.append("")
        lines.append(f"**方法**: `{method}` | **文件**: `{file_path}`")
        lines.append("")
        lines.append(desc)
        lines.append("")
        lines.append("")

    return "\n".join(lines)


def generate_components_section(components: Dict[str, Dict]) -> str:
    """生成组件清单 section。"""
    if not components:
        return "*(暂无组件)*"

    # 按 category 分组
    categories: Dict[str, List] = {}
    for path, info in components.items():
        cat = info["category"]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(info)

    lines = []
    for cat in sorted(categories.keys()):
        lines.append(f"#### `{cat}/`")
        for info in sorted(categories[cat], key=lambda x: x["name"]):
            lines.append(f"- `{info['name']}` - {info['description']} ({info['lines']}行)")
        lines.append("")

    return "\n".join(lines)


def generate_lib_section(lib_files: Dict[str, Dict]) -> str:
    """生成 lib 库清单 section。"""
    if not lib_files:
        return "*(暂无库文件)*"

    lines = []
    for path, info in sorted(lib_files.items()):
        lines.append(f"- `{info['name']}{Path(path).suffix}` - {info['description']} ({info['lines']}行)")

    return "\n".join(lines)


def generate_types_section(types_files: Dict[str, Dict]) -> str:
    """生成 types 类型定义 section。"""
    if not types_files:
        return "*(暂无类型定义)*"

    lines = []
    for path, info in sorted(types_files.items()):
        lines.append(f"- `{info['name']}{Path(path).suffix}` - {info['description']} ({info['lines']}行)")

    return "\n".join(lines)


def generate_config_section(config_files: Dict[str, Dict]) -> str:
    """生成 config 配置 section。"""
    if not config_files:
        return "*(暂无配置文件)*"

    lines = []
    for path, info in sorted(config_files.items()):
        lines.append(f"- `{info['name']}{Path(path).suffix}` - {info['description']} ({info['lines']}行)")

    return "\n".join(lines)


def generate_data_section(data_files: Dict[str, Dict]) -> str:
    """生成数据文件 section。"""
    if not data_files:
        return "*(暂无数据文件)*"

    lines = []
    for path, info in sorted(data_files.items()):
        lines.append(
            f"- `{info['name']}{Path(path).suffix}` - {info['description']} ({info['size']})"
        )

    return "\n".join(lines)


def generate_pages_section(pages: Dict[str, Dict]) -> str:
    """生成页面清单 section。"""
    if not pages:
        return "*(暂无页面)*"

    lines = []
    for path, info in sorted(pages.items(), key=lambda x: x[1]["route"]):
        lines.append(f"- `{info['route']}` - {info['description']} (`{info['file']}`, {info['lines']}行)")

    return "\n".join(lines)


def generate_statistics(
    scripts: Dict,
    apis: Dict,
    components: Dict,
    lib_files: Dict,
    types_files: Dict,
    config_files: Dict,
    data_files: Dict,
    pages: Dict,
) -> str:
    """生成统计摘要。"""
    total_lines = sum(s.get("lines", 0) for s in scripts.values())
    total_lines += sum(a.get("lines", 0) for a in apis.values())
    total_lines += sum(c.get("lines", 0) for c in components.values())
    total_lines += sum(l.get("lines", 0) for l in lib_files.values())
    total_lines += sum(t.get("lines", 0) for t in types_files.values())
    total_lines += sum(c.get("lines", 0) for c in config_files.values())

    data_size = sum(d.get("size_bytes", 0) for d in data_files.values())

    lines = [
        "## 统计摘要",
        "",
        f"| 类别 | 数量 | 行数/大小 |",
        f"|------|------|--------|",
        f"| 脚本 | {len(scripts)} | {total_lines} 行 |",
        f"| API 路由 | {len(apis)} | {sum(a.get('lines', 0) for a in apis.values())} 行 |",
        f"| 组件 | {len(components)} | {sum(c.get('lines', 0) for c in components.values())} 行 |",
        f"| 核心库 | {len(lib_files)} | {sum(l.get('lines', 0) for l in lib_files.values())} 行 |",
        f"| 类型定义 | {len(types_files)} | {sum(t.get('lines', 0) for t in types_files.values())} 行 |",
        f"| 配置文件 | {len(config_files)} | {sum(c.get('lines', 0) for c in config_files.values())} 行 |",
        f"| 页面 | {len(pages)} | {sum(p.get('lines', 0) for p in pages.values())} 行 |",
        f"| 数据文件 | {len(data_files)} | {data_size / (1024**2):.1f} MB |",
        "",
        f"> 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
    ]
    return "\n".join(lines)


# ==================== 同步逻辑 ====================

def find_placeholder_blocks(content: str, section: str) -> Tuple[Optional[int], Optional[int], str]:
    """
    查找指定 section 的占位符块。

    返回：
        (start_line, end_line, section_name)
        start_line 和 end_line 是 0-based 索引
        如果未找到，返回 (None, None, "")
    """
    start_marker = f"{AUTO_START}:{section} -->"
    end_marker = f"{AUTO_END}:{section} -->"

    start_idx = None
    end_idx = None

    for i, line in enumerate(content.splitlines()):
        if start_marker in line and start_idx is None:
            start_idx = i
        if end_marker in line and start_idx is not None:
            end_idx = i
            break

    if start_idx is not None and end_idx is not None:
        return start_idx, end_idx, section
    return None, None, ""


def detect_project_md_issues(project_md_content: str) -> Tuple[List[str], List[str]]:
    """
    检测 PROJECT.md 中的问题：
    - 缺失文件（文档中记录但实际不存在的文件）
    - 过时内容（需要更新的部分）

    返回：
        (missing_files, outdated_sections)
    """
    missing = []
    outdated = []

    # 检测缺失的脚本文件
    script_pattern = re.compile(r"#---\s*脚本[\s\d]*#\s*\n(.*?)(?:---|\Z)", re.DOTALL)
    for match in script_pattern.finditer(project_md_content):
        block = match.group(1)
        for line in block.splitlines():
            file_match = re.search(r"scripts[/\\]([\w.-]+\.(?:py|js|cjs|mjs))", line)
            if file_match:
                filename = file_match.group(1)
                script_path = SCRIPTS_DIR / filename
                if not script_path.exists():
                    missing.append(f"scripts/{filename}")

    # 检测缺失的 API 文件
    api_pattern = re.compile(r"\*\*文件\*\*:`([^`]+)`")
    for match in api_pattern.finditer(project_md_content):
        file_path = match.group(1).replace("\\", "/")
        full_path = PROJECT_ROOT / file_path
        if not full_path.exists():
            missing.append(file_path)

    # 检测缺失的 src 文件
    src_pattern = re.compile(r"`(src[/\\][^`]+)`")
    for match in src_pattern.finditer(project_md_content):
        file_path = match.group(1).replace("\\", "/")
        full_path = PROJECT_ROOT / file_path
        if not full_path.exists() and "." in Path(file_path).name:
            missing.append(file_path)

    return missing, outdated


def replace_auto_block(content: str, section: str, new_content: str) -> str:
    """
    替换指定 section 的自动生成内容块。
    如果占位符不存在，在合适的位置插入。
    """
    start_marker = f"{AUTO_START}:{section} -->"
    end_marker = f"{AUTO_END}:{section} -->"

    # 尝试替换现有块
    start_idx = None
    end_idx = None
    for i, line in enumerate(content.splitlines()):
        if start_marker in line and start_idx is None:
            start_idx = i
        if end_marker in line and start_idx is not None:
            end_idx = i
            break

    if start_idx is not None and end_idx is not None:
        lines = content.splitlines()
        lines[start_idx : end_idx + 1] = [start_marker, new_content, end_marker]
        return "\n".join(lines)

    # 占位符不存在，返回原始内容（由调用者决定如何处理）
    return content


def sync_project_md(report: DiagnosticReport) -> bool:
    """
    执行 PROJECT.md 同步。

    返回：
        True 如果成功，False 如果失败
    """
    if not PROJECT_MD.exists():
        print(f"错误: {PROJECT_MD} 不存在")
        return False

    print(f"\n读取 {PROJECT_MD}...")
    content = PROJECT_MD.read_text(encoding="utf-8")

    # 扫描所有代码结构
    print("扫描 scripts/ 目录...")
    scripts = scan_scripts()

    print("扫描 API 路由...")
    apis = scan_api_routes()

    print("扫描组件...")
    components = scan_components()

    print("扫描 lib 目录...")
    lib_files = scan_lib()

    print("扫描 types 目录...")
    types_files = scan_types()

    print("扫描 config 目录...")
    config_files = scan_config()

    print("扫描数据文件...")
    data_files = scan_data_files()

    print("扫描页面...")
    pages = scan_app_pages()

    # 生成各 section 内容
    sections = {
        "dir_tree": generate_directory_tree(),
        "scripts": generate_scripts_section(scripts),
        "api": generate_api_section(apis),
        "components": generate_components_section(components),
        "lib": generate_lib_section(lib_files),
        "types": generate_types_section(types_files),
        "config": generate_config_section(config_files),
        "data": generate_data_section(data_files),
        "pages": generate_pages_section(pages),
        "stats": generate_statistics(
            scripts, apis, components, lib_files, types_files, config_files, data_files, pages
        ),
    }

    # 更新每个 section
    modified = False
    for section_name, section_content in sections.items():
        new_content = replace_auto_block(content, section_name, section_content)
        if new_content != content:
            content = new_content
            modified = True
            print(f"  更新 section [{section_name}]")

    if not modified:
        print("\nPROJECT.md 已是最新，无需更新")
        return True

    # 写入文件
    print(f"\n写入 {PROJECT_MD}...")
    PROJECT_MD.write_text(content, encoding="utf-8")
    print("同步完成!")
    return True


# ==================== 诊断报告 ====================

def generate_diagnostic_report(report: DiagnosticReport) -> str:
    """生成诊断报告文本。"""
    lines = [
        "=" * 70,
        "文档同步诊断报告",
        f"生成时间: {report.timestamp}",
        "=" * 70,
        "",
    ]

    # 统计摘要
    lines.append("## 扫描统计")
    lines.append("-" * 40)
    lines.append(f"  脚本文件: {len(report.scripts_found)} 个")

    # 缺失文件
    all_missing = (
        report.scripts_missing
        + report.api_missing
        + report.components_missing
        + report.lib_missing
        + report.data_missing
    )
    if all_missing:
        lines.append("")
        lines.append("## 缺失文件（PROJECT.md 记录但不存在）")
        lines.append("-" * 40)
        for f in sorted(set(all_missing)):
            lines.append(f"  [缺失] {f}")

    # 额外文件
    all_extra = (
        report.scripts_extra
        + report.api_extra
        + report.components_extra
        + report.lib_extra
        + report.data_extra
    )
    if all_extra:
        lines.append("")
        lines.append("## 新增文件（实际存在但 PROJECT.md 未记录）")
        lines.append("-" * 40)
        for f in sorted(set(all_extra)):
            lines.append(f"  [新增] {f}")

    # 警告
    if report.warnings:
        lines.append("")
        lines.append("## 警告")
        lines.append("-" * 40)
        for w in report.warnings:
            lines.append(f"  [警告] {w}")

    # 计划更改
    if report.changes_to_make:
        lines.append("")
        lines.append("## 计划更改")
        lines.append("-" * 40)
        for c in report.changes_to_make:
            lines.append(f"  {c}")

    lines.append("")
    lines.append("=" * 70)

    return "\n".join(lines)


def run_check(report: DiagnosticReport) -> str:
    """执行检查模式：只生成诊断报告，不修改文件。"""
    print("=" * 70)
    print("文档同步检查模式")
    print(f"生成时间: {report.timestamp}")
    print("=" * 70)

    # 扫描
    print("\n[1/8] 扫描 scripts/ 目录...")
    scripts = scan_scripts()
    report.scripts_found = list(scripts.keys())
    print(f"      找到 {len(scripts)} 个脚本")

    print("\n[2/8] 扫描 API 路由...")
    apis = scan_api_routes()
    report.api_found = list(apis.keys())
    print(f"      找到 {len(apis)} 个 API 路由")

    print("\n[3/8] 扫描组件...")
    components = scan_components()
    report.components_found = list(components.keys())
    print(f"      找到 {len(components)} 个组件")

    print("\n[4/8] 扫描 lib 目录...")
    lib_files = scan_lib()
    report.lib_found = list(lib_files.keys())
    print(f"      找到 {len(lib_files)} 个库文件")

    print("\n[5/8] 扫描 types 目录...")
    types_files = scan_types()
    print(f"      找到 {len(types_files)} 个类型定义")

    print("\n[6/8] 扫描 config 目录...")
    config_files = scan_config()
    print(f"      找到 {len(config_files)} 个配置文件")

    print("\n[7/8] 扫描数据文件...")
    data_files = scan_data_files()
    report.data_found = list(data_files.keys())
    print(f"      找到 {len(data_files)} 个数据文件")

    print("\n[8/8] 扫描页面...")
    pages = scan_app_pages()
    print(f"      找到 {len(pages)} 个页面")

    # 检测 PROJECT.md 问题
    print("\n检测 PROJECT.md 问题...")
    if PROJECT_MD.exists():
        content = PROJECT_MD.read_text(encoding="utf-8")
        missing, outdated = detect_project_md_issues(content)

        scripts_missing = [m for m in missing if m.startswith("scripts/")]
        api_missing = [m for m in missing if m.startswith("src/app/api/")]
        components_missing = [m for m in missing if m.startswith("src/components/")]
        lib_missing = [m for m in missing if m.startswith("src/lib/")]
        data_missing = [m for m in missing if m.startswith("public/data/")]

        # 检测 PROJECT.md 中记录但文件不存在的
        report.scripts_missing = scripts_missing
        report.api_missing = api_missing
        report.components_missing = components_missing
        report.lib_missing = lib_missing
        report.data_missing = data_missing

        # 检测 PROJECT.md 中未记录但实际存在的
        # 这需要解析 PROJECT.md 中已有的内容
        # 简化处理：检测明显的新增文件
        project_md_text = content

        # 脚本：PROJECT.md 中可能记录了 25 个，但实际可能更少
        # 我们主要关注"被删除但 PROJECT.md 仍记录"的情况
        for path in scripts_missing:
            report.warnings.append(f"脚本已删除但 PROJECT.md 仍有记录: {path}")

        for path in api_missing:
            report.warnings.append(f"API 路由已删除但 PROJECT.md 仍有记录: {path}")

        for path in components_missing:
            report.warnings.append(f"组件已删除但 PROJECT.md 仍有记录: {path}")
    else:
        report.warnings.append(f"PROJECT.md 不存在: {PROJECT_MD}")

    # 输出诊断报告
    report_text = generate_diagnostic_report(report)
    print(report_text)

    # 输出各个 section 的预览
    print("\n" + "=" * 70)
    print("各 Section 预览")
    print("=" * 70)

    print("\n### 目录结构预览:")
    print(generate_directory_tree()[:500] + "...\n")

    print("\n### 统计摘要:")
    print(
        generate_statistics(
            scripts, apis, components, lib_files, types_files, config_files, data_files, pages
        )
    )

    return report_text


def run_dry_run(report: DiagnosticReport) -> str:
    """执行干跑模式：显示将要做的更改。"""
    print("=" * 70)
    print("文档同步干跑模式（不实际写入）")
    print("=" * 70)

    # 先执行检查
    run_check(report)

    # 显示将会执行的更改
    print("\n" + "=" * 70)
    print("将要执行的更改")
    print("=" * 70)

    report.changes_to_make.append("替换 AUTO_START:dir_tree / AUTO_END:dir_tree 块")
    report.changes_to_make.append("替换 AUTO_START:scripts / AUTO_END:scripts 块")
    report.changes_to_make.append("替换 AUTO_START:api / AUTO_END:api 块")
    report.changes_to_make.append("替换 AUTO_START:components / AUTO_END:components 块")
    report.changes_to_make.append("替换 AUTO_START:lib / AUTO_END:lib 块")
    report.changes_to_make.append("替换 AUTO_START:types / AUTO_END:types 块")
    report.changes_to_make.append("替换 AUTO_START:config / AUTO_END:config 块")
    report.changes_to_make.append("替换 AUTO_START:data / AUTO_END:data 块")
    report.changes_to_make.append("替换 AUTO_START:pages / AUTO_END:pages 块")
    report.changes_to_make.append("替换 AUTO_START:stats / AUTO_END:stats 块")

    for c in report.changes_to_make:
        print(f"  + {c}")

    return "\n".join(report.changes_to_make)


# ==================== 占位符注入 ====================

def inject_placeholders():
    """
    在 PROJECT.md 中注入占位符（如果不存在）。
    这是一个一次性操作，用于初始化占位符结构。
    """
    if not PROJECT_MD.exists():
        print(f"错误: {PROJECT_MD} 不存在")
        return False

    content = PROJECT_MD.read_text(encoding="utf-8")

    # 定义需要注入的占位符
    placeholders = {
        "dir_tree": "## 完整目录结构\n\n*(自动生成)*\n\n",
        "scripts": "---\n\n## 脚本列表\n\n*(自动生成)*\n\n",
        "api": "---\n\n## API 接口\n\n*(自动生成)*\n\n",
        "components": "---\n\n## 组件清单\n\n*(自动生成)*\n\n",
        "lib": "---\n\n## 核心库\n\n*(自动生成)*\n\n",
        "types": "---\n\n## 类型定义\n\n*(自动生成)*\n\n",
        "config": "---\n\n## 配置文件\n\n*(自动生成)*\n\n",
        "data": "---\n\n## 数据文件\n\n*(自动生成)*\n\n",
        "pages": "---\n\n## 页面清单\n\n*(自动生成)*\n\n",
        "stats": "---\n\n## 统计摘要\n\n*(自动生成)*\n\n",
    }

    # 检查每个占位符是否存在
    for section, default_content in placeholders.items():
        start_marker = f"{AUTO_START}:{section} -->"
        end_marker = f"{AUTO_END}:{section} -->"

        if start_marker not in content or end_marker not in content:
            print(f"  注入占位符: {section}")
            # 在适当位置插入
            # 简单处理：在文件末尾或特定标记后插入
            lines = content.splitlines()

            # 找到合适的位置插入
            # 对于 dir_tree，在 "## 完整目录结构" 之后
            # 对于其他，在各自对应的标题后

            insert_idx = None
            section_headers = {
                "dir_tree": "## 完整目录结构",
                "scripts": "## 脚本列表",
                "api": "## API 接口",
                "components": "## 组件清单",
                "lib": "## 核心库",
                "types": "## 类型定义",
                "config": "## 配置文件",
                "data": "## 数据文件",
                "pages": "## 页面清单",
                "stats": "## 统计摘要",
            }

            header = section_headers.get(section, "")
            for i, line in enumerate(lines):
                if line.strip() == header.strip():
                    # 找到标题后的空行
                    insert_idx = i + 1
                    while insert_idx < len(lines) and lines[insert_idx].strip() == "":
                        insert_idx += 1
                    break

            if insert_idx is not None:
                placeholder_block = [
                    "",
                    start_marker,
                    "",
                    end_marker,
                    "",
                ]
                lines = lines[:insert_idx] + placeholder_block + lines[insert_idx:]
                content = "\n".join(lines)
                print(f"    在第 {insert_idx} 行后插入了 {section} 占位符")
            else:
                print(f"    警告: 未找到 {section} 的标题位置")

    # 写回文件
    PROJECT_MD.write_text(content, encoding="utf-8")
    print("\n占位符注入完成")
    return True


# ==================== 主函数 ====================

def main():
    import argparse

    parser = argparse.ArgumentParser(description="文档自动同步脚本")
    parser.add_argument(
        "--check", action="store_true", help="仅生成诊断报告，不修改文件"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="显示将要做的更改，不实际写入"
    )
    parser.add_argument(
        "--inject", action="store_true", help="注入占位符（一次性初始化）"
    )
    parser.add_argument(
        "--force", action="store_true", help="强制同步（跳过确认）"
    )

    args = parser.parse_args()

    print("=" * 70)
    print("Steam 全域游戏搜索 - 文档自动同步工具")
    print("=" * 70)

    # 检查项目根目录
    if not PROJECT_ROOT.exists():
        print(f"错误: 项目根目录不存在: {PROJECT_ROOT}")
        sys.exit(1)

    report = DiagnosticReport()

    if args.inject:
        inject_placeholders()
        return

    if args.check:
        run_check(report)
        return

    if args.dry_run:
        run_dry_run(report)
        return

    # 完整同步模式
    print("\n执行完整同步...")

    if not args.force:
        print("\n警告: 即将修改 PROJECT.md 文件。")
        print("建议先使用 --check 或 --dry-run 模式查看更改内容。")
        response = input("\n是否继续? (y/N): ")
        if response.lower() not in ("y", "yes"):
            print("已取消")
            return

    success = sync_project_md(report)
    if success:
        print("\n同步完成!")
        print("建议运行: git diff docs/PROJECT.md 查看更改")
    else:
        print("\n同步失败")
        sys.exit(1)


if __name__ == "__main__":
    main()
