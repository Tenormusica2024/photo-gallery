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

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-lg flex items-center justify-center flex-col"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 w-11 h-11 rounded-full bg-white/20 text-white text-2xl hover:bg-white/30 transition-colors flex items-center justify-center"
        aria-label="Close"
      >
        &times;
      </button>

      {/* Navigation arrows */}
      {currentIndex > 0 && (
        <button
          onClick={() => onNavigate(currentIndex - 1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 text-white text-xl hover:bg-white/30 transition-colors flex items-center justify-center"
          aria-label="Previous"
        >
          &#8249;
        </button>
      )}
      {currentIndex < photos.length - 1 && (
        <button
          onClick={() => onNavigate(currentIndex + 1)}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 text-white text-xl hover:bg-white/30 transition-colors flex items-center justify-center"
          aria-label="Next"
        >
          &#8250;
        </button>
      )}

      {/* Image */}
      <img
        src={photo.url}
        alt={photo.title || "Photo"}
        className="max-w-[90vw] max-h-[80vh] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.3)]"
      />

      {/* Info */}
      <div className="text-white text-center mt-4">
        <p className="font-bold">{photo.title || "Untitled"}</p>
        <p className="text-sm text-white/75">
          {new Date(photo.created_at).toLocaleDateString("ja-JP")}
          {" "}
          ({currentIndex + 1} / {photos.length})
        </p>
      </div>
    </div>
  );
}
