import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">页面未找到</h1>
      <p className="text-muted-foreground text-center max-w-md">
        该分析不存在，或暂时无法生成。请从首页搜索游戏，或选择精选游戏中的条目。
      </p>
      <Link
        href="/"
        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        返回首页
      </Link>
    </div>
  );
}
