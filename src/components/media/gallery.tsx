"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ScreenshotGalleryProps {
  screenshots: string[];
  className?: string;
}

export function ScreenshotGallery({ screenshots, className }: ScreenshotGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const openLightbox = (index: number) => {
    setSelectedIndex(index);
  };

  const closeLightbox = () => {
    setSelectedIndex(null);
  };

  const goToPrevious = () => {
    if (selectedIndex !== null) {
      setSelectedIndex(selectedIndex === 0 ? screenshots.length - 1 : selectedIndex - 1);
    }
  };

  const goToNext = () => {
    if (selectedIndex !== null) {
      setSelectedIndex(selectedIndex === screenshots.length - 1 ? 0 : selectedIndex + 1);
    }
  };

  if (screenshots.length === 0) {
    return (
      <div className={cn("text-center py-12 text-muted-foreground", className)}>
        <p>暂无截图素材</p>
      </div>
    );
  }

  return (
    <>
      <div className={cn("grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4", className)}>
        {screenshots.map((screenshot, index) => (
          <Card
            key={index}
            className="overflow-hidden cursor-pointer group relative"
            onClick={() => openLightbox(index)}
          >
            <div className="relative aspect-video bg-muted">
              <Image
                src={screenshot}
                alt={`截图 ${index + 1}`}
                fill
                className="object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ZoomIn className="w-8 h-8 text-white" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Lightbox */}
      {selectedIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
          {/* 关闭按钮 */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={closeLightbox}
          >
            <X className="w-6 h-6" />
          </Button>

          {/* 上一张 */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 text-white hover:bg-white/20"
            onClick={goToPrevious}
          >
            <ChevronLeft className="w-8 h-8" />
          </Button>

          {/* 当前图片 */}
          <div className="relative max-w-5xl max-h-[80vh]">
            <Image
              src={screenshots[selectedIndex]}
              alt={`截图 ${selectedIndex + 1}`}
              width={1280}
              height={720}
              className="object-contain"
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm">
              {selectedIndex + 1} / {screenshots.length}
            </div>
          </div>

          {/* 下一张 */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 text-white hover:bg-white/20"
            onClick={goToNext}
          >
            <ChevronRight className="w-8 h-8" />
          </Button>
        </div>
      )}
    </>
  );
}