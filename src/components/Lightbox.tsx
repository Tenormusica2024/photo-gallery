"use client";

import { useEffect, useCallback } from "react";
import type { Photo } from "@/types/database";

interface Props {
  photos: Photo[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function Lightbox({ photos, currentIndex, onClose, onNavigate }: Props) {
  const photo = photos[currentIndex];
  const isVideo = photo.media_type === "video";

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && currentIndex < photos.length - 1)
        onNavigate(currentIndex + 1);
      if (e.key === "ArrowLeft" && currentIndex > 0)
        onNavigate(currentIndex - 1);
    },
    [currentIndex, photos.length, onClose, onNavigate]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  // Cloudinary URLにfl_attachmentを付与してブラウザダウンロードを強制
  function handleDownload() {
    const url = new URL(photo.url);
    url.searchParams.set("fl_attachment", photo.title || (isVideo ? "動画" : "写真"));
    const a = document.createElement("a");
    a.href = url.toString();
    a.download = photo.title || (isVideo ? "動画" : "写真");
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-lg flex items-center justify-center flex-col"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* ツールバー: 閉じる + ダウンロード */}
      <div className="absolute top-6 right-6 flex items-center gap-3">
        <button
          onClick={handleDownload}
          className="w-11 h-11 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors flex items-center justify-center"
          aria-label="ダウンロード"
          title="ダウンロード"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        <button
          onClick={onClose}
          className="w-11 h-11 rounded-full bg-white/20 text-white text-2xl hover:bg-white/30 transition-colors flex items-center justify-center"
          aria-label="閉じる"
        >
          &times;
        </button>
      </div>

      {/* ナビゲーション矢印 */}
      {currentIndex > 0 && (
        <button
          onClick={() => onNavigate(currentIndex - 1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 text-white text-xl hover:bg-white/30 transition-colors flex items-center justify-center"
          aria-label="前へ"
        >
          &#8249;
        </button>
      )}
      {currentIndex < photos.length - 1 && (
        <button
          onClick={() => onNavigate(currentIndex + 1)}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 text-white text-xl hover:bg-white/30 transition-colors flex items-center justify-center"
          aria-label="次へ"
        >
          &#8250;
        </button>
      )}

      {/* メディア表示: 画像 or 動画 */}
      {isVideo ? (
        <video
          src={photo.url}
          controls
          autoPlay
          playsInline
          className="max-w-[90vw] max-h-[80vh] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.3)]"
        />
      ) : (
        <img
          src={photo.url}
          alt={photo.title || "Photo"}
          className="max-w-[90vw] max-h-[80vh] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.3)]"
        />
      )}

      {/* 情報 */}
      <div className="text-white text-center mt-4">
        <p className="font-bold">{photo.title || "無題"}</p>
        <p className="text-sm text-white/75">
          {new Date(photo.created_at).toLocaleDateString("ja-JP")}
          {" "}
          ({currentIndex + 1} / {photos.length})
        </p>
      </div>
    </div>
  );
}
