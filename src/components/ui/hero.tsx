"use client";

import { Search, Sword, BarChart3, Layers, Sparkles } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface HeroProps {
  className?: string;
}

export function Hero({ className }: HeroProps) {
  return (
    <section className={cn("relative w-full min-w-0 overflow-hidden bg-gradient-to-b from-primary/10 to-background py-20", className)}>
      <div className="container mx-auto w-full min-w-0 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center gap-4 mb-6">
            <Search className="w-8 h-8 text-primary" />
            <Sword className="w-8 h-8 text-primary" />
            <BarChart3 className="w-8 h-8 text-primary" />
            <Layers className="w-8 h-8 text-primary" />
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            鍥炲悎鍒舵垬鏂楀垎鏋愬伐鍏?          </h1>
          
          <p className="text-xl text-muted-foreground mb-8">
            娣卞叆鍒嗘瀽Steam绛夊钩鍙颁笂鐨勫洖鍚堝埗娓告垙鎴樻枟绯荤粺
            <br />
            鍙戠幇鍒涙柊鐜╂硶锛岃瘎浼扮瓥鐣ユ繁搴︼紝姣旇緝鏁板€煎钩琛?          </p>

          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <Link
              href="/mode2"
              className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/20 transition-colors group"
            >
              <span className="font-semibold text-emerald-500">鏂板姛鑳?/span> 瀹濆彲姊ike绛涢€夊櫒
            </Link>
          </div>

        </div>
      </div>
      
      <div className="absolute -bottom-1 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
