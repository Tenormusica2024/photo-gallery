"use client";

import { useState, lazy, Suspense } from "react";
import Image from "next/image";
import type { Photo } from "@/types/database";

// Lightboxは写真クリック時のみ必要なので遅延読み込み（初期バンドルを削減）
const Lightbox = lazy(() => import("./Lightbox"));

interface Props {
  photos: Photo[];
  albumMap?: Record<string, string>;
}

export default function MasonryGrid({ photos, albumMap }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  return (
    <>
      <div className="columns-1 sm:columns-2 lg:columns-3 gap-4">
        {photos.map((photo, i) => {
          const isVideo = photo.media_type === "video";
          return (
            <div
              key={photo.id}
              className="break-inside-avoid mb-4 rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(216,27,96,0.08)] hover:shadow-[0_8px_30px_rgba(216,27,96,0.15)] hover:-translate-y-1 transition-all cursor-pointer group relative bg-white"
              onClick={() => setSelectedIndex(i)}
            >
              {isVideo ? (
                <video
                  src={photo.url}
                  poster={photo.thumbnail_url || undefined}
                  className="w-full block group-hover:scale-[1.03] transition-transform duration-400"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <Image
                  src={photo.url}
                  alt={photo.title || "写真"}
                  width={photo.width || 600}
                  height={photo.height || 600}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  // 最初の3枚はLCP改善のためpriority指定（プリロード）
                  priority={i < 3}
                  className="w-full h-auto block group-hover:scale-[1.03] transition-transform duration-400"
                />
              )}
              {/* 動画バッジ */}
              {isVideo && (
                <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  {photo.duration ? `${Math.floor(photo.duration / 60)}:${String(photo.duration % 60).padStart(2, "0")}` : "動画"}
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-pink-600/50 to-transparent p-4 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-white font-bold text-sm">
                  {photo.title || "無題"}
                </p>
                {photo.description && (
                  <p className="text-white/90 text-xs mt-0.5 line-clamp-2">
                    {photo.description}
                  </p>
                )}
                <p className="text-white/70 text-xs mt-0.5">
                  {new Date(photo.created_at).toLocaleDateString("ja-JP")}
                </p>
                {photo.album_id && albumMap?.[photo.album_id] && (
                  <p className="text-purple-200 text-xs mt-1 flex items-center gap-1">
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="truncate">{albumMap[photo.album_id]}</span>
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedIndex !== null && (
        <Suspense fallback={null}>
          <Lightbox
            photos={photos}
            currentIndex={selectedIndex}
            onClose={() => setSelectedIndex(null)}
            onNavigate={setSelectedIndex}
          />
        </Suspense>
      )}
    </>
  );
}
