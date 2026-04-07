"use client";

import { useState } from "react";
import type { Photo } from "@/types/database";
import Lightbox from "./Lightbox";

interface Props {
  photos: Photo[];
}

export default function MasonryGrid({ photos }: Props) {
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
                <img
                  src={photo.url}
                  alt={photo.title || "Photo"}
                  loading="lazy"
                  className="w-full block group-hover:scale-[1.03] transition-transform duration-400"
                />
              )}
              {/* 動画バッジ */}
              {isVideo && (
                <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  {photo.duration ? `${Math.floor(photo.duration / 60)}:${String(photo.duration % 60).padStart(2, "0")}` : "Video"}
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-pink-600/50 to-transparent p-4 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-white font-bold text-sm">
                  {photo.title || "Untitled"}
                </p>
                <p className="text-white/85 text-xs">
                  {new Date(photo.created_at).toLocaleDateString("ja-JP")}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {selectedIndex !== null && (
        <Lightbox
          photos={photos}
          currentIndex={selectedIndex}
          onClose={() => setSelectedIndex(null)}
          onNavigate={setSelectedIndex}
        />
      )}
    </>
  );
}
